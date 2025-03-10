import {
	type ParseContext,
	type ParsePath,
	type TransformContext,
	type DecodeContext,
	NilError,
	type SizeContext,
	hasResolvePath,
	type ResolvePathFunc,
	type addQuestionMarks,
	type flatten,
	formatPath
} from './util';

export type NilRawShape = { [k: string]: NilTypeAny };
export type NilTypeAny = NilType<any, any>;
export type input<T extends NilType<any, any, any>> = T['_input'];
export type output<T extends NilType<any, any, any>> = T['_output'];

type baseObjectOutputType<Shape extends NilRawShape> = {
	[k in keyof Shape]: Shape[k]['_output'];
};

export type objectOutputType<Shape extends NilRawShape> = flatten<
	addQuestionMarks<baseObjectOutputType<Shape>>
>;

type TransformType<Output = any, Input = Output, Def = object> = [
	afterDecode: (
		ctx: TransformContext<Input, Def>,
		resolvePath: <T = unknown>(path: ParsePath) => T
	) => Promise<Output> | Output,
	beforeEncode: (
		ctx: TransformContext<Output, Def>,
		resolvePath: <T = unknown>(path: ParsePath) => T
	) => Promise<Input> | Input
];

export abstract class NilType<Output = any, Def = object, Input = Output> {
	readonly _def: Def;
	readonly _output!: Output;
	readonly _input!: Input;

	abstract size(ctx: SizeContext<Input, Def>): number;

	abstract _decode(ctx: DecodeContext<Input, Def>): Input;
	abstract _encode(ctx: ParseContext<Input, Def>): void;

	async _afterDecode(ctx: TransformContext<Input, Def>): Promise<Output> {
		return ctx.value as never;
	}

	async _beforeEncode(ctx: TransformContext<Output, Def>): Promise<Input> {
		return ctx.value as never;
	}

	async fromBuffer(buffer: Uint8Array, offset = 0): Promise<Output> {
		const ctx: any = { path: [], buffer, offset, _def: this._def };
		ctx.view = new DataView(buffer.buffer);
		ctx.size = this.size(ctx);
		ctx.value = this._decode(ctx);
		return this._afterDecode(ctx);
	}

	async toBuffer(value: Output): Promise<Uint8Array> {
		const ctx: any = { path: [], value, offset: 0, _def: this._def };
		ctx.value = await this._beforeEncode(ctx);
		ctx.size = this.size(ctx);
		ctx.buffer = new Uint8Array(ctx.size);
		ctx.view = new DataView(ctx.buffer.buffer);
		this._encode(ctx);
		return ctx.buffer;
	}

	_resolvePath(path: ParsePath, ctx: SizeContext) {
		let relativeCtx: SizeContext | undefined = ctx;
		let relativePath = path;

		if (relativePath[0] === '~') {
			while (relativeCtx?.parent?.parent) relativeCtx = relativeCtx.parent;
			relativePath = relativePath.slice(1);
		}

		while (relativePath[0] === '^') {
			relativeCtx = relativeCtx?.parent;
			relativePath = relativePath.slice(1);
		}
		const newCtx = relativeCtx?.parent;
		if (!newCtx)
			throw new NilError(
				`Failed to resolve ${formatPath(path)}, no parent found.`,
				ctx
			);

		if (relativePath.length === 0 || !hasResolvePath(newCtx._def))
			return newCtx.value;
		return newCtx._def._resolvePath(relativePath, newCtx, relativeCtx);
	}

	constructor(def: Def) {
		this._def = def;
	}

	transform<NewOutput>(
		...transform: TransformType<NewOutput, Input>
	): NilEffects<this, NewOutput, Input> {
		return new NilEffects({ schema: this, transform });
	}
}

export type NilEffectsDef<T extends NilTypeAny = NilTypeAny> = {
	schema: T;
	transform: TransformType<any, any>;
};

export class NilEffects<
	T extends NilTypeAny,
	Output = output<T>,
	Input = input<T>
> extends NilType<Output, NilEffectsDef<T>, Input> {
	size(ctx: SizeContext<Input, NilEffectsDef<T>>) {
		return this._def.schema.size({ ...ctx, _def: this._def.schema._def });
	}

	_decode(ctx: ParseContext<Input, NilEffectsDef<T>>) {
		return this._def.schema._decode({ ...ctx, _def: this._def.schema._def });
	}

	_encode(ctx: ParseContext<Input, NilEffectsDef<T>>) {
		this._def.schema._encode({ ...ctx, _def: this._def.schema._def });
	}

	async _afterDecode(
		ctx: TransformContext<Input, NilEffectsDef<T>>
	): Promise<Output> {
		const { schema } = this._def;
		try {
			const value = await schema._afterDecode(ctx);
			return this._def.transform[0](
				{
					...ctx,
					value,
					_def: this._def.schema._def
				},
				path => this._resolvePath(path, ctx)
			);
		} catch (e) {
			if (e instanceof NilError) throw e;
			throw new NilError(
				`Failed to transform: ${
					e instanceof Error ? e.message : JSON.stringify(e)
				}`,
				ctx
			);
		}
	}

	async _beforeEncode(
		ctx: TransformContext<Output, NilEffectsDef<T>>
	): Promise<Input> {
		const { schema } = this._def;
		try {
			const value = await this._def.transform[1](ctx, path =>
				this._resolvePath(path, ctx)
			);
			return schema._beforeEncode({
				...ctx,
				value,
				_def: this._def.schema._def
			});
		} catch (e) {
			if (e instanceof NilError) throw e;
			throw new NilError(
				`Failed to transform: ${
					e instanceof Error ? e.message : JSON.stringify(e)
				}`,
				ctx
			);
		}
	}
}

export class NilBool extends NilType<boolean> {
	size() {
		return 1;
	}

	_decode(ctx: DecodeContext<boolean>) {
		const { buffer, offset } = ctx;

		const missingBytes = offset + 1 - buffer.byteLength;
		if (missingBytes > 0)
			throw new NilError(
				`Not enough space to decode boolean, missing ${missingBytes} byte(s)`,
				ctx
			);

		const value = buffer[offset];
		switch (value) {
			case 0:
				return false;
			case 1:
				return true;
			default:
				throw new NilError(`Invalid value ${value} for a boolean`, ctx);
		}
	}

	_encode({ buffer, offset, value }: ParseContext<boolean>) {
		buffer[offset] = value ? 1 : 0;
	}
}

export type NilNumberDef = {
	bytes: 1 | 2 | 4 | 8;
	signed?: boolean;
	floating?: boolean;
	bigEndian?: boolean;
};

export class NilNumber extends NilType<number, NilNumberDef> {
	size() {
		return this._def.bytes;
	}

	_decode(ctx: DecodeContext<number, NilNumberDef>) {
		const { view, offset } = ctx;
		const { bytes, signed, floating, bigEndian: be } = this._def;

		const missingBytes = offset + bytes - view.byteLength;
		if (missingBytes > 0)
			throw new NilError(
				`Not enough space to decode ${bytes}-byte number, missing ${missingBytes} byte(s)`,
				ctx
			);

		if (floating) {
			switch (bytes) {
				case 4:
					return view.getFloat32(offset, !be);
				case 8:
					return view.getFloat64(offset, !be);
				default:
					/* istanbul ignore next */
					throw new NilError(
						`Invalid byte size ${bytes} for a floating point number`,
						ctx
					);
			}
		}

		switch (bytes) {
			case 1:
				return signed ? view.getInt8(offset) : view.getUint8(offset);
			case 2:
				return signed
					? view.getInt16(offset, !be)
					: view.getUint16(offset, !be);
			case 4:
				return signed
					? view.getInt32(offset, !be)
					: view.getUint32(offset, !be);
			case 8:
				/* istanbul ignore next */
				throw new NilError('For parsing 8 byte numbers us n.bigint', ctx);
		}
	}

	_encode(ctx: ParseContext<number, NilNumberDef>) {
		const { view, offset, value } = ctx;
		const { bytes, signed, floating, bigEndian: be } = this._def;

		if (Number.isNaN(value))
			throw new NilError(`Can't encode NaN as a number`, ctx);

		if (!Number.isFinite(value))
			throw new NilError(`Can't encode Infinity as a number`, ctx);

		if (floating) {
			const floatRanges = {
				4: [-3.4028235e38, 3.4028235e38],
				8: [-1.7976931348623157e308, 1.7976931348623157e308]
			};

			const range = floatRanges[bytes as keyof typeof floatRanges];
			if (value > range[1] || value < range[0]) {
				throw new NilError(
					`Value ${value} is out of range for ${
						bytes * 8
					}-bit floating point number`,
					ctx
				);
			}

			switch (bytes) {
				case 4:
					view.setFloat32(offset, value, !be);
					return;
				case 8:
					view.setFloat64(offset, value, !be);
					return;
			}
		}

		if (value % 1 !== 0)
			throw new NilError(
				`Can't encode non-integer value ${value} as a number`,
				ctx
			);

		const intRanges = {
			1: signed ? [-128, 127] : [0, 255],
			2: signed ? [-32768, 32767] : [0, 65535],
			4: signed ? [-2147483648, 2147483647] : [0, 4294967295]
		};

		const range = intRanges[bytes as keyof typeof intRanges];
		if (value > range[1] || value < range[0]) {
			throw new NilError(
				`Value ${value} is out of range for ${bytes * 8}-bit ${
					signed ? 'signed' : 'unsigned'
				} integer`,
				ctx
			);
		}

		switch (bytes) {
			case 1:
				return signed
					? view.setInt8(offset, value)
					: view.setUint8(offset, value);
			case 2:
				return signed
					? view.setInt16(offset, value, !be)
					: view.setUint16(offset, value, !be);
			case 4:
				return signed
					? view.setInt32(offset, value, !be)
					: view.setUint32(offset, value, !be);
		}
	}

	be() {
		this._def.bigEndian = true;
		return this;
	}
}

export type NilBigintDef = {
	signed?: boolean;
	bigEndian?: boolean;
};

export class NilBigint extends NilType<bigint, NilBigintDef> {
	size() {
		return 8;
	}

	_decode(ctx: DecodeContext<bigint, NilBigintDef>) {
		const { view, offset } = ctx;
		const { signed, bigEndian: be } = this._def;

		const missingBytes = offset + 8 - view.byteLength;
		if (missingBytes > 0)
			throw new NilError(
				`Not enough space to decode 8-byte number, missing ${missingBytes} byte(s)`,
				ctx
			);

		return signed
			? view.getBigInt64(offset, !be)
			: view.getBigUint64(offset, !be);
	}

	_encode(ctx: ParseContext<bigint, NilBigintDef>) {
		const { view, offset, value } = ctx;
		const { signed, bigEndian: be } = this._def;

		const bigintRanges = {
			signed: [-BigInt('9223372036854775808'), BigInt('9223372036854775807')],
			unsigned: [BigInt(0), BigInt('18446744073709551615')]
		};

		const range = signed ? bigintRanges.signed : bigintRanges.unsigned;

		if (value > range[1] || value < range[0]) {
			throw new NilError(
				`Value ${value} is out of range for 64-bit ${
					signed ? 'signed' : 'unsigned'
				} integer`,
				ctx
			);
		}

		signed
			? view.setBigInt64(offset, value, !be)
			: view.setBigUint64(offset, value, !be);
	}

	be() {
		this._def.bigEndian = true;
		return this;
	}
}

export type NilBufferDef = {
	length: number | ParsePath | 'fill';
	inBytes?: boolean;
};

export class NilBuffer extends NilType<Uint8Array, NilBufferDef> {
	size(ctx: SizeContext<Uint8Array, NilBufferDef>) {
		const { length, inBytes } = this._def;
		const { buffer, offset, value } = ctx;

		if (typeof length === 'number') return length / (inBytes ? 8 : 1);
		if (length === 'fill') {
			if (value !== undefined) return value.length;
			if (!buffer || offset === undefined) return -1;
			return buffer.subarray(offset).length;
		}

		const resolved = this._resolvePath(length, ctx);
		if (resolved === undefined) return -1;
		if (typeof resolved !== 'number')
			throw new NilError(
				`Invalid length ${resolved} resolved from ${formatPath(length)}`,
				ctx
			);
		return resolved;
	}

	_decode(ctx: DecodeContext<Uint8Array, NilBufferDef>) {
		const { buffer, offset, size } = ctx;

		const missingBytes = offset + size - buffer.byteLength;
		if (missingBytes > 0)
			throw new NilError(
				`Not enough space to decode ${size}-byte buffer, missing ${missingBytes} byte(s)`,
				ctx
			);

		return buffer.subarray(offset, offset + size);
	}

	_encode(ctx: ParseContext<Uint8Array, NilBufferDef>) {
		const { buffer, offset, size, value } = ctx;
		if (value.length !== size)
			throw new NilError(
				`Buffer length ${value.length} does not match expected length ${size}`,
				ctx
			);
		buffer.subarray(offset, offset + size).set(value);
	}

	bytes() {
		if (typeof this._def.length === 'string')
			throw new Error(`Can't set bytes on dynamic length buffer.`);
		if (typeof this._def.length === 'number' && this._def.length % 8)
			throw new Error(`Byte size ${this._def.length} is not divisible by 8.`);
		this._def.inBytes = true;
		return this;
	}
}

export type NilStringDef = {
	length: number | ParsePath | 'fill' | 'null-terminated';
	inBytes?: boolean;
};

export class NilString extends NilType<string, NilStringDef> {
	size(ctx: SizeContext<string, NilStringDef>) {
		const { length, inBytes } = this._def;
		const { buffer, offset, value } = ctx;

		if (typeof length === 'number') return length / (inBytes ? 8 : 1);
		if (length === 'fill') {
			if (value !== undefined) return value.length;
			if (!buffer || offset === undefined) return -1;
			return new TextDecoder('utf-8').decode(buffer.subarray(offset)).length;
		}
		if (length === 'null-terminated') {
			if (value !== undefined) return value.split('\0')[0].length + 1;
			if (!buffer || offset === undefined) return -1;
			let i = 0;
			while (buffer[offset + i] !== 0) i++;
			return i + 1;
		}

		const resolved = this._resolvePath(length, ctx);
		if (resolved === undefined) return -1;
		if (typeof resolved !== 'number')
			throw new NilError(
				`Invalid length ${resolved} resolved from ${formatPath(length)}`,
				ctx
			);
		return resolved / (inBytes ? 8 : 1);
	}

	_decode(ctx: DecodeContext<string, NilStringDef>) {
		const { buffer, offset, size } = ctx;

		const missingBytes = offset + size - buffer.byteLength;
		if (missingBytes > 0)
			throw new NilError(
				`Not enough space to decode ${size}-byte string, missing ${missingBytes} byte(s)`,
				ctx
			);

		const val = new TextDecoder('utf-8').decode(
			buffer.subarray(offset, offset + size)
		);
		return this._def.length === 'null-terminated' ? val.slice(0, -1) : val;
	}

	_encode(ctx: ParseContext<string, NilStringDef>) {
		const { buffer, offset, size, value } = ctx;
		const val =
			this._def.length === 'null-terminated'
				? `${value.split('\0')[0]}\0`
				: value;
		const r = new TextEncoder().encodeInto(
			val,
			buffer.subarray(offset, offset + size)
		);
		if (val.length !== r.read || size !== r.written)
			throw new NilError(
				`String "${val}" wrong length to encode into ${size} bits`,
				ctx
			);
	}

	bytes() {
		if (typeof this._def.length === 'string')
			throw new Error(`Can't set bytes on dynamic length string.`);
		if (typeof this._def.length === 'number' && this._def.length % 8)
			throw new Error(`Byte size ${this._def.length} is not divisible by 8.`);
		this._def.inBytes = true;
		return this;
	}
}

export type NilArrayDef<T extends NilTypeAny = NilTypeAny> = {
	schema: T;
	length: number | ParsePath | 'fill';
	inBytes?: boolean;
	_resolvePath: typeof NilArray._resolvePath;
};

export class NilArray<T extends NilTypeAny> extends NilType<
	T['_output'][],
	NilArrayDef<T>,
	T['_input'][]
> {
	size(ctx: SizeContext<T['_input'][], NilArrayDef<T>>) {
		const { schema, length, inBytes } = this._def;
		const { buffer, offset, value, size } = ctx;

		if (size !== undefined) return size;

		const forLoopSum = (l: number) => {
			let size = 0;
			for (let i = 0; i < l; i++) {
				const elementSize = schema.size(NilArray._elemCtx(i, size, ctx));
				if (elementSize === -1) return -1;
				size += elementSize;
			}
			return size;
		};

		const whileLoopSum = (l: number) => {
			let size = 0;
			let i = 0;
			while (offset + size < l) {
				const elementSize = schema.size(NilArray._elemCtx(i, size, ctx));
				if (elementSize === -1) return -1;
				size += elementSize;
				i++;
			}
			return size;
		};

		if (typeof length === 'number')
			return inBytes ? whileLoopSum(length / 8) : forLoopSum(length);

		if (length === 'fill') {
			if (value !== undefined) return forLoopSum(value.length);
			if (!buffer || offset === undefined) return -1;
			return whileLoopSum(buffer.length);
		}

		const resolved = this._resolvePath(length, ctx);
		if (resolved === undefined) return -1;
		if (typeof resolved !== 'number')
			throw new NilError(
				`Invalid length ${resolved} resolved from ${formatPath(length)}`,
				ctx
			);

		return inBytes ? whileLoopSum(resolved / 8) : forLoopSum(resolved);
	}

	_decode(ctx: DecodeContext<T['_input'][], NilArrayDef<T>>) {
		const { schema } = this._def;
		const { offset, buffer, view } = ctx;

		const value: T['_input'][] = [];

		const size = this.size(ctx);
		const totalSize = size === -1 ? buffer.byteLength - offset : size;

		let idx = 0;
		let currentOffset = 0;
		while (currentOffset < totalSize) {
			const elemCtx = NilArray._elemCtx(idx, currentOffset, ctx);
			const size = schema.size(elemCtx);
			value.push(schema._decode({ ...elemCtx, buffer, view, size }));
			ctx.value = value;
			currentOffset += size;
			idx++;
		}

		return value;
	}

	_encode(ctx: ParseContext<T['_input'][], NilArrayDef<T>>) {
		const { schema } = this._def;
		const { offset, buffer, view } = ctx;

		const size = this.size(ctx);
		const endOffset = size === -1 ? buffer.byteLength - offset : size;

		let i = 0;
		let currOffset = 0;
		while (currOffset < endOffset) {
			if (i >= ctx.value.length)
				throw new NilError(
					`Array length ${ctx.value.length} is smaller than expected length`,
					ctx
				);
			const elemCtx = NilArray._elemCtx(i, currOffset, ctx);
			const elemSize = schema.size(elemCtx);
			schema._encode({ ...elemCtx, buffer, view, size: elemSize });
			currOffset += elemSize;
			i++;
		}
		if (i < ctx.value.length)
			throw new NilError(
				`Array length ${ctx.value.length} is larger than expected length`,
				ctx
			);
	}

	async _afterDecode(ctx: TransformContext<T['_input'][], NilArrayDef<T>>) {
		const { schema } = this._def;
		return Promise.all(
			[...Array(ctx.value.length).keys()].map(i =>
				schema._afterDecode({
					value: ctx.value?.[i],
					path: [...ctx.path, i],
					parent: ctx,
					offset: ctx.offset,
					_def: schema._def
				})
			)
		);
	}

	async _beforeEncode(ctx: TransformContext<T['_output'][], NilArrayDef<T>>) {
		const { schema } = this._def;
		return Promise.all(
			[...Array(ctx.value.length).keys()].map(i =>
				schema._beforeEncode({
					value: ctx.value?.[i],
					path: [...ctx.path, i],
					parent: ctx,
					offset: ctx.offset,
					_def: schema._def
				})
			)
		);
	}

	static _elemCtx = <T extends NilTypeAny>(
		i: number,
		currOffset: number,
		ctx: SizeContext<T['_input'][], NilArrayDef<T>>
	) => ({
		buffer: ctx.buffer,
		offset: ctx.offset + currOffset,
		value: ctx.value?.[i],
		path: [...ctx.path, i],
		parent: ctx,
		_def: ctx._def.schema._def
	});

	static _resolvePath: ResolvePathFunc<any, NilArrayDef> = (
		path,
		ctx,
		from
	) => {
		if (path.length === 0) return ctx.value;

		const key = path[0];
		if (typeof key !== 'number' || Number.isNaN(key) || key < 0)
			throw new NilError(
				`Invalid key ${key} in path ${formatPath(
					path
				)}, key of an array must be a number`,
				ctx
			);

		const fromKey = from?.path.at(-1);
		if (typeof fromKey === 'number' && key > fromKey)
			throw new NilError(
				`Failed to resolve ${formatPath(
					path
				)} from index ${fromKey}, you can only reference elements defined before the current one`,
				ctx
			);

		const def = ctx._def.schema._def;
		if (hasResolvePath(def))
			return def._resolvePath(path.slice(1), this._elemCtx(key, 0, ctx), ctx);

		return ctx.value?.[key];
	};

	bytes() {
		if (typeof this._def.length === 'string')
			throw new Error(`Can't set bytes on dynamic length array.`);
		if (typeof this._def.length === 'number' && this._def.length % 8)
			throw new Error(`Byte size ${this._def.length} is not divisible by 8.`);
		this._def.inBytes = true;
		return this;
	}
}

export type NilObjectDef<T extends NilRawShape = NilRawShape> = {
	shape: T;
	_resolvePath: typeof NilObject._resolvePath;
};

export class NilObject<
	T extends NilRawShape,
	Output = objectOutputType<T>,
	Input = Output
> extends NilType<Output, NilObjectDef<T>, Input> {
	size(ctx: SizeContext<Input, NilObjectDef<T>>) {
		const { shape } = this._def;

		let size = 0;
		for (const [key, schema] of Object.entries(shape)) {
			const elementSize = schema.size(NilObject._elemCtx(key, size, ctx));
			if (elementSize === -1) return -1;
			size += elementSize;
		}
		return size;
	}

	_decode(ctx: DecodeContext<Input, NilObjectDef<T>>) {
		const { shape } = this._def;
		const { buffer, view } = ctx;

		const value: Partial<Input> = {};

		let currOffset = 0;
		Object.entries(shape).forEach(([key, schema]) => {
			const elemCtx = NilObject._elemCtx(key, currOffset, ctx);
			const elemSize = schema.size(elemCtx);
			if (currOffset + elemSize > buffer.byteLength)
				throw new NilError(
					`Not enough space to decode object key ${key}, missing ${
						currOffset + elemSize - buffer.byteLength
					} byte(s)`,
					ctx
				);
			value[key as keyof Input] = schema._decode({
				...elemCtx,
				buffer,
				view,
				size: elemSize
			});
			ctx.value = value as Input;
			currOffset += elemSize;
		});

		return value as Input;
	}

	_encode(ctx: ParseContext<Input, NilObjectDef<T>>) {
		const { shape } = this._def;
		const { buffer, view } = ctx;

		let currOffset = 0;
		Object.entries(shape).forEach(([key, schema]) => {
			const elemCtx = NilObject._elemCtx(key, currOffset, ctx);
			if (elemCtx.value === undefined && !(schema instanceof NilUndefined))
				throw new NilError(`Missing value for field ${key}`, ctx);
			const elemSize = schema.size(elemCtx);
			schema._encode({ ...elemCtx, buffer, view, size: elemSize });
			currOffset += elemSize;
		});
	}

	async _afterDecode(ctx: TransformContext<Input, NilObjectDef<T>>) {
		const { shape } = this._def;
		const value = await Promise.all(
			Object.entries(shape).map(async ([key, schema]) => [
				key,
				await schema._afterDecode({
					value: ctx.value?.[key as keyof Input],
					path: [...ctx.path, key],
					parent: ctx,
					offset: ctx.offset,
					_def: schema._def
				})
			])
		);
		return Object.fromEntries(value);
	}

	async _beforeEncode(ctx: TransformContext<Output, NilObjectDef<T>>) {
		const { shape } = this._def;
		const value = await Promise.all(
			Object.entries(shape).map(async ([key, schema]) => [
				key,
				await schema._beforeEncode({
					value: ctx.value?.[key as keyof Output],
					path: [...ctx.path, key],
					parent: ctx,
					offset: ctx.offset,
					_def: schema._def
				})
			])
		);
		return Object.fromEntries(value);
	}

	static _elemCtx = <
		T extends NilRawShape,
		Output = objectOutputType<T>,
		Input = Output
	>(
		key: string,
		currOffset: number,
		ctx: SizeContext<Input, NilObjectDef<T>>
	) => ({
		buffer: ctx.buffer,
		offset: ctx.offset + currOffset,
		value: ctx.value?.[key as keyof Input],
		path: [...ctx.path, key],
		parent: ctx,
		_def: ctx._def.shape[key]._def
	});

	static _resolvePath: ResolvePathFunc<any, NilObjectDef> = (
		path,
		ctx,
		from
	) => {
		if (path.length === 0) return ctx.value;

		const key = path[0];
		if (!key || typeof key !== 'string')
			throw new NilError(
				`Invalid key ${key} in path ${formatPath(
					path
				)}, key of an object must be a string`,
				ctx
			);

		const keys = Object.keys(ctx._def.shape);
		const fromKey = from?.path.at(-1);
		if (
			typeof fromKey === 'string' &&
			keys.indexOf(key) > keys.indexOf(fromKey)
		)
			throw new NilError(
				`Failed to resolve ${formatPath(path)} on { ${keys.join(
					', '
				)} } from element ${from?.path.at(
					-1
				)}, you can only reference keys defined before the current one.`,
				ctx
			);

		if (!ctx._def.shape[key])
			throw new NilError(
				`Failed to resolve ${formatPath(path)} on { ${keys.join(
					', '
				)} }, key not found`,
				ctx
			);

		const def = ctx._def.shape[key]._def;
		if (hasResolvePath(def))
			return def._resolvePath(path.slice(1), this._elemCtx(key, 0, ctx), ctx);

		return ctx.value?.[key];
	};
}

export type NilEnumDef<
	T extends NilNumber,
	O extends readonly string[] | string[]
> = {
	type: T;
	options: O;
};

export class NilEnum<
	T extends NilNumber,
	O extends readonly string[] | string[]
> extends NilType<O[number], NilEnumDef<T, O>, T['_input']> {
	size() {
		return this._def.type.size();
	}

	_decode(ctx: DecodeContext<T['_input'], NilEnumDef<T, O>>) {
		return this._def.type._decode({ ...ctx, _def: ctx._def.type._def });
	}

	_encode(ctx: ParseContext<T['_input'], NilEnumDef<T, O>>) {
		this._def.type._encode({ ...ctx, _def: ctx._def.type._def });
	}

	async _afterDecode(ctx: TransformContext<T['_input'], NilEnumDef<T, O>>) {
		const { value } = ctx;
		const option = this._def.options[value];
		if (option === undefined)
			throw new NilError(
				`Invalid index "${value}" for enum "[${this._def.options}]"`,
				ctx
			);
		return option;
	}

	async _beforeEncode(ctx: TransformContext<O[number], NilEnumDef<T, O>>) {
		const { value } = ctx;
		const index = this._def.options.indexOf(value);
		if (index === -1)
			throw new NilError(
				`Invalid value "${value}" for enum "[${this._def.options}]"`,
				ctx
			);
		return index;
	}

	get options() {
		return this._def.options;
	}
}

// type NilRefShape = {
// 	offset: NilNumber;
// 	[k: string]: NilTypeAny;
// };

// type NilRefDef<
// 	T extends NilTypeAny = NilTypeAny,
// 	THead extends NilObject<NilRefShape> = NilObject<NilRefShape>
// > = {
// 	schema: T;
// 	header: THead;
// };

// export class NilRef<
// 	T extends NilTypeAny,
// 	Output = output<T>,
// 	Input = input<T>
// > extends NilType<Output, NilRefDef<T>, Input> {
// 	size(ctx: SizeContext<Input, NilRefDef<T>>) {
// 		return this._def.header.size({
// 			...ctx,
// 			_def: this._def.header._def
// 		} as never);
// 	}

// 	_decode(ctx: DecodeContext<Input, NilRefDef<T>>) {
// 		return this._def.schema._decode({ ...ctx, _def: this._def.schema._def });
// 	}

// 	_encode(ctx: ParseContext<Input, NilRefDef<T>>) {
// 		this._def.schema._encode({ ...ctx, _def: this._def.schema._def });
// 	}

// 	transform<NewOutput>(
// 		..._: TransformType<NewOutput, Input>
// 	): NilEffects<this, NewOutput, Input> {
// 		throw Error(
// 			'Transforms are not supported on references. Please transform the referenced schema instead.'
// 		);
// 	}
// }

export class NilUndefined extends NilType<undefined> {
	size() {
		return 0;
	}

	_decode() {
		return undefined;
	}

	_encode() {
		// Do nothing
	}
}

const bool = () => new NilBool({});
const int8 = () => new NilNumber({ bytes: 1, signed: true });
const uint8 = () => new NilNumber({ bytes: 1 });
const int16 = () => new NilNumber({ bytes: 2, signed: true });
const uint16 = () => new NilNumber({ bytes: 2 });
const int32 = () => new NilNumber({ bytes: 4, signed: true });
const uint32 = () => new NilNumber({ bytes: 4 });
const int64 = () => new NilBigint({ signed: true });
const uint64 = () => new NilBigint({});
const float = () => new NilNumber({ bytes: 4, floating: true });
const double = () => new NilNumber({ bytes: 8, floating: true });
const buffer = (length: NilBufferDef['length']) => new NilBuffer({ length });
const string = (length: NilStringDef['length']) => new NilString({ length });
const array = <T extends NilTypeAny>(
	schema: T,
	length: NilArrayDef<T>['length']
) => new NilArray({ schema, length, _resolvePath: NilArray._resolvePath });
const object = <T extends NilRawShape>(shape: T) =>
	new NilObject({ shape, _resolvePath: NilObject._resolvePath });
const enum_ = <
	T extends NilNumber,
	const O extends readonly string[] | string[]
>(
	type: T,
	options: O
): NilEnum<T, O> => {
	if (type._def.floating)
		throw new Error('Enums can only be created with integer types.');
	if (!options.length)
		throw new Error('Enum options must have at least one option.');
	if (options.length > Math.pow(type.size() * 8, 2))
		throw new Error(
			`Too many options (${
				options.length
			}) for ${type.size()} byte underlying type.`
		);
	return new NilEnum({ type, options });
};
const undefined_ = () => new NilUndefined({});

export {
	bool,
	int8,
	uint8,
	int16,
	uint16,
	int32,
	uint32,
	int64,
	uint64,
	float,
	double,
	buffer,
	string,
	array,
	object,
	enum_ as enum,
	undefined_ as undefined
};
