import {
	resolvePath,
	type ParseContext,
	type ParsePath,
	type TransformContext,
	type DecodeContext,
	NilError,
	type SizeContext
} from './helpers/parseUtil';
import {
	// parallelMap,
	type addQuestionMarks,
	type flatten
} from './helpers/util';

export type NilRawShape = { [k: string]: NilTypeAny };
export type NilTypeAny = NilType<any, any>;
export type TypeOf<T extends NilType<any, any, any>> = T['_output'];
export type input<T extends NilType<any, any, any>> = T['_input'];
export type output<T extends NilType<any, any, any>> = T['_output'];

type baseObjectOutputType<Shape extends NilRawShape> = {
	[k in keyof Shape]: Shape[k]['_output'];
};

export type objectOutputType<Shape extends NilRawShape> = flatten<
	addQuestionMarks<baseObjectOutputType<Shape>>
>;

type TransformType<Output = any, Input = Output> = [
	afterDecode: (ctx: TransformContext<Input>) => Promise<Output> | Output,
	beforeEncode: (ctx: TransformContext<Output>) => Promise<Input> | Input
];

export abstract class NilType<Output = any, Def = object, Input = Output> {
	readonly _def: Def;
	readonly _output!: Output;
	readonly _input!: Input;

	abstract size(ctx: SizeContext<Input>): number;

	abstract _decode(ctx: DecodeContext<Input>): Input;
	abstract _encode(ctx: ParseContext<Input>): void;

	async _afterDecode(ctx: TransformContext<Input>): Promise<Output> {
		return ctx.value as never;
	}

	async _beforeEncode(ctx: TransformContext<Output>): Promise<Input> {
		return ctx.value as never;
	}

	async fromBuffer(buffer: Uint8Array): Promise<Output> {
		const data = new DataView(buffer.buffer);
		const ctx = { path: [], data, buffer, offset: 0 };
		const size = this.size(ctx);
		const value = this._decode({ ...ctx, size });
		return this._afterDecode({ ...ctx, value });
	}

	async toBuffer(v: Output): Promise<Uint8Array> {
		const ctx = { path: [], offset: 0 };
		const value = await this._beforeEncode({ ...ctx, value: v });
		const size = this.size({ ...ctx, value });
		const buffer = new Uint8Array(size);
		const data = new DataView(buffer.buffer);
		this._encode({ ...ctx, value, data, buffer, size: buffer.length });
		return buffer;
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

class NilEffects<
	T extends NilTypeAny,
	Output = output<T>,
	Input = input<T>
> extends NilType<Output, NilEffectsDef<T>, Input> {
	size(ctx: SizeContext<Input>) {
		return this._def.schema.size(ctx);
	}

	_decode(ctx: ParseContext<Input>) {
		return this._def.schema._decode(ctx);
	}

	_encode(ctx: ParseContext<Input>) {
		this._def.schema._encode(ctx);
	}

	async _afterDecode(ctx: TransformContext<Input>): Promise<Output> {
		const { schema } = this._def;
		try {
			const value = await schema._afterDecode(ctx);
			return this._def.transform[0]({ ...ctx, value });
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

	async _beforeEncode(ctx: TransformContext<Output>): Promise<Input> {
		const { schema } = this._def;
		try {
			const value = await this._def.transform[1](ctx);
			return schema._beforeEncode({ ...ctx, value });
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
		const { data, offset } = ctx;

		const missingBytes = offset + 1 - data.byteLength;
		if (missingBytes > 0)
			throw new NilError(
				`Not enough space to decode boolean, missing ${missingBytes} byte(s)`,
				ctx
			);

		const value = data.getInt8(offset);
		switch (value) {
			case 0:
				return false;
			case 1:
				return true;
			default:
				throw new NilError(`Invalid value ${value} for a boolean`, ctx);
		}
	}

	_encode({ data, offset, value }: ParseContext<boolean>) {
		data.setInt8(offset, value ? 1 : 0);
	}
}

type NilNumberDef = {
	bytes: 1 | 2 | 4 | 8;
	signed?: boolean;
	floating?: boolean;
	bigEndian?: boolean;
};

export class NilNumber extends NilType<number, NilNumberDef> {
	size() {
		return this._def.bytes;
	}

	_decode(ctx: DecodeContext<number>) {
		const { data, offset } = ctx;
		const { bytes, signed, floating, bigEndian: be } = this._def;

		const missingBytes = offset + bytes - data.byteLength;
		if (missingBytes > 0)
			throw new NilError(
				`Not enough space to decode ${bytes}-byte number, missing ${missingBytes} byte(s)`,
				ctx
			);

		if (floating) {
			switch (bytes) {
				case 4:
					return data.getFloat32(offset, !be);
				case 8:
					return data.getFloat64(offset, !be);
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
				return signed ? data.getInt8(offset) : data.getUint8(offset);
			case 2:
				return signed
					? data.getInt16(offset, !be)
					: data.getUint16(offset, !be);
			case 4:
				return signed
					? data.getInt32(offset, !be)
					: data.getUint32(offset, !be);
			case 8:
				/* istanbul ignore next */
				throw new NilError('For parsing 8 byte numbers us n.bigint', ctx);
		}
	}

	_encode(ctx: ParseContext<number>) {
		const { data, offset, value } = ctx;
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

			const range = floatRanges[bytes as never];
			if (!range)
				/* istanbul ignore next */
				throw new NilError(
					`Invalid byte size ${bytes} for a floating point number`,
					ctx
				);

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
					return data.setFloat32(offset, value, !be);
				case 8:
					return data.setFloat64(offset, value, !be);
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

		const range = intRanges[bytes as never];
		if (!range)
			/* istanbul ignore next */
			throw new NilError(
				`Invalid byte size ${bytes} for an integer number`,
				ctx
			);

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
					? data.setInt8(offset, value)
					: data.setUint8(offset, value);
			case 2:
				return signed
					? data.setInt16(offset, value, !be)
					: data.setUint16(offset, value, !be);
			case 4:
				return signed
					? data.setInt32(offset, value, !be)
					: data.setUint32(offset, value, !be);
		}
	}

	be() {
		this._def.bigEndian = true;
		return this;
	}
}

type NilBigintDef = {
	signed?: boolean;
	bigEndian?: boolean;
};

export class NilBigint extends NilType<bigint, NilBigintDef> {
	size() {
		return 8;
	}

	_decode(ctx: DecodeContext<bigint>) {
		const { data, offset } = ctx;
		const { signed, bigEndian: be } = this._def;

		const missingBytes = offset + 8 - data.byteLength;
		if (missingBytes > 0)
			throw new NilError(
				`Not enough space to decode 8-byte number, missing ${missingBytes} byte(s)`,
				ctx
			);

		return signed
			? data.getBigInt64(offset, !be)
			: data.getBigUint64(offset, !be);
	}

	_encode(ctx: ParseContext<bigint>) {
		const { data, offset, value } = ctx;
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
			? data.setBigInt64(offset, value, !be)
			: data.setBigUint64(offset, value, !be);
	}

	be() {
		this._def.bigEndian = true;
		return this;
	}
}

type NilBufferDef = {
	length: number | ParsePath | 'fill';
	inBytes?: boolean;
};

class NilBuffer extends NilType<Uint8Array, NilBufferDef> {
	size(ctx: SizeContext<Uint8Array>) {
		const { length, inBytes } = this._def;
		const { buffer, offset, value } = ctx;

		if (typeof length === 'number') return length / (inBytes ? 8 : 1);
		if (length === 'fill') {
			if (value !== undefined) return value.length;
			if (!buffer || offset === undefined) return -1;
			return buffer.subarray(offset).length;
		}
		// TODO: Test after objects/arrays are done
		const resolved = resolvePath(length, ctx);
		if (typeof resolved !== 'number')
			throw new NilError(
				`Invalid length "${resolved}" resolved from ${length.join('/')}`,
				ctx
			);
		return resolved;
	}

	_decode(ctx: DecodeContext<Uint8Array>) {
		const { buffer, offset, size } = ctx;

		const missingBytes = offset + size - buffer.byteLength;
		if (missingBytes > 0)
			throw new NilError(
				`Not enough space to decode ${size}-byte buffer, missing ${missingBytes} byte(s)`,
				ctx
			);

		return buffer.subarray(offset, offset + size);
	}

	_encode(ctx: ParseContext<Uint8Array>) {
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

type NilStringDef = {
	length: number | ParsePath | 'fill' | 'null-terminated';
	inBytes?: boolean;
};

export class NilString extends NilType<string, NilStringDef> {
	size(ctx: SizeContext<string>) {
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
		// TODO: Test after objects/arrays are done
		const resolved = resolvePath(length, ctx);
		if (typeof resolved !== 'number')
			throw new NilError(
				`Invalid length "${resolved}" resolved from ${length.join('/')}`,
				ctx
			);
		return resolved / (inBytes ? 8 : 1);
	}

	_decode(ctx: DecodeContext<string>) {
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

	_encode(ctx: ParseContext<string>) {
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

type NilArrayDef<T extends NilTypeAny = NilTypeAny> = {
	schema: T;
	length: number | ParsePath | 'fill';
	inBytes?: boolean;
};

class NilArray<T extends NilTypeAny> extends NilType<
	T['_output'][],
	NilArrayDef<T>,
	T['_input'][]
> {
	size(ctx: SizeContext<T['_input'][]>) {
		const { schema, length, inBytes } = this._def;
		const { buffer, offset, value, size } = ctx;

		if (size !== undefined) return size;

		const forLoopSum = (l: number) => {
			let size = 0;
			for (let i = 0; i < l; i++) {
				const elementSize = schema.size(this.#elemCtx(i, size, ctx));
				if (elementSize === -1) return -1;
				size += elementSize;
			}
			return size;
		};

		const whileLoopSum = (l: number) => {
			let size = 0;
			let i = 0;
			while (offset + size < l) {
				const elementSize = schema.size(this.#elemCtx(i, size, ctx));
				if (elementSize === -1) return -1;
				size += elementSize;
				i++;
			}
			return size;
		};

		if (typeof length === 'number')
			return inBytes ? whileLoopSum(length) : forLoopSum(length);

		if (length === 'fill') {
			if (value !== undefined) return forLoopSum(value.length);
			if (!buffer || offset === undefined) return -1;
			return whileLoopSum(buffer.length);
		}

		// TODO: Test after objects/arrays are done
		const resolved = resolvePath(length, ctx);
		if (typeof resolved !== 'number')
			throw new NilError(
				`Invalid length "${resolved}" resolved from ${length.join('/')}`,
				ctx
			);

		return inBytes ? whileLoopSum(resolved) : forLoopSum(resolved);
	}

	_decode(ctx: DecodeContext<T['_input'][]>) {
		const { schema } = this._def;
		const { offset, data, buffer } = ctx;

		const value: T['_input'][] = [];

		const size = this.size(ctx);
		const totalSize = size === -1 ? data.byteLength - offset : size;

		let idx = 0;
		let currentOffset = 0;
		while (currentOffset < totalSize) {
			const elemCtx = this.#elemCtx(idx, currentOffset, ctx);
			const size = schema.size(elemCtx);
			value.push(schema._decode({ ...elemCtx, data, buffer, size }));
			currentOffset += size;
			idx++;
		}

		return value;
	}

	_encode(ctx: ParseContext<T['_input'][]>) {
		const { schema } = this._def;
		const { offset, data, buffer } = ctx;

		const size = this.size(ctx);
		const endOffset = size === -1 ? data.byteLength - offset : size;

		let i = 0;
		let currOffset = 0;
		while (currOffset < endOffset) {
			if (i >= ctx.value.length)
				throw new NilError(
					`NilError: Array length ${ctx.value.length} is smaller than expected length`,
					ctx
				);
			const elemCtx = this.#elemCtx(i, currOffset, ctx);
			const elemSize = schema.size(elemCtx);
			schema._encode({ ...elemCtx, data, buffer, size: elemSize });
			currOffset += elemSize;
			i++;
		}
		if (i < ctx.value.length)
			throw new NilError(
				`NilError: Array length ${ctx.value.length} is larger than expected length`,
				ctx
			);
	}

	async _afterDecode(ctx: TransformContext<T['_input'][]>) {
		const { schema } = this._def;
		return Promise.all(
			[...Array(ctx.value.length).keys()].map(i =>
				schema._afterDecode({
					value: ctx.value?.[i],
					path: [...ctx.path, i],
					parent: ctx
				})
			)
		);
	}

	async _beforeEncode(ctx: TransformContext<T['_output'][]>) {
		const { schema } = this._def;
		return Promise.all(
			[...Array(ctx.value.length).keys()].map(i =>
				schema._beforeEncode({
					value: ctx.value?.[i],
					path: [...ctx.path, i],
					parent: ctx
				})
			)
		);
	}

	#elemCtx(i: number, currOffset: number, ctx: SizeContext<T['_input'][]>) {
		return {
			buffer: ctx.buffer,
			data: ctx.data,
			offset: ctx.offset + currOffset,
			value: ctx.value?.[i],
			path: [...ctx.path, i],
			parent: ctx
		};
	}

	bytes() {
		if (typeof this._def.length === 'string')
			throw new Error(`Can't set bytes on dynamic length array.`);
		if (typeof this._def.length === 'number' && this._def.length % 8)
			throw new Error(`Byte size ${this._def.length} is not divisible by 8.`);
		this._def.inBytes = true;
		return this;
	}
}

// type NilObjectDef<T extends NilRawShape = NilRawShape> = {
// 	shape: T;
// };

// class NilObject<
// 	T extends NilRawShape,
// 	Output = objectOutputType<T>,
// 	Input = Output
// > extends NilType<Output, NilObjectDef<T>, Input> {
// 	size(ctx: Partial<ParseContext>) {
// 		const { shape } = this._def;
// 		return Object.entries(shape).reduce((acc, [k, v]) => {
// 			if (acc === -1) return -1;
// 			const newCtx: ParseContext = {
// 				// FIXME: Types
// 				value: value as never,
// 				path: [...(ctx?.path ?? []), k],
// 				parent: ctx
// 			};
// 			const size = v.size(value?.[k as keyof Input], newCtx);
// 			return size === -1 ? -1 : acc + size;
// 		}, 0);
// 	}

// 	_decode({ data, offset }: ParseContext) {
// 		const { shape } = this._def;
// 		const value: Partial<Input> = {};

// 		let currentOffset = offset;
// 		Object.entries(shape).forEach(([k, v]) => {
// 			const newCtx: ParseContext = {
// 				value,
// 				path: [...(ctx?.path ?? []), k],
// 				parent: ctx
// 			};
// 			const size = v.size(undefined, newCtx);
// 			const step = size === -1 ? data.byteLength - currentOffset : size;
// 			value[k as keyof Input] = v._decode(data, currentOffset, newCtx);
// 			currentOffset += step;
// 		});

// 		return value as Input;
// 	}

// 	_encode(value: Input, { data, offset }: ParseContext) {
// 		const { shape } = this._def;

// 		let currentOffset = offset;
// 		Object.entries(shape).forEach(([k, v]) => {
// 			const newCtx: ParseContext = {
// 				// FIXME: Types
// 				value: value as never,
// 				path: [...(ctx?.path ?? []), k],
// 				parent: ctx
// 			};
// 			const size = v.size(value[k as keyof Input], newCtx);
// 			v._encode(data, currentOffset, value[k as keyof Input], newCtx);
// 			currentOffset += size;
// 		});
// 	}

// 	async _afterDecode(value: Input, ctx: ParseContext) {
// 		const { shape } = this._def;
// 		return parallelMap(shape, async (v, k) =>
// 			v._afterDecode(value[k as keyof Input], {
// 				// FIXME: Types
// 				value: value as never,
// 				path: [...(ctx?.path ?? []), k],
// 				parent: ctx
// 			})
// 		) as Promise<Output>;
// 	}

// 	async _beforeEncode(value: Output, ctx?: ParseContext) {
// 		const { shape } = this._def;
// 		return parallelMap(shape, async (v, k) =>
// 			v._beforeEncode(value[k as keyof Output], {
// 				// FIXME: Types
// 				value: value as never,
// 				path: [...(ctx?.path ?? []), k],
// 				parent: ctx
// 			})
// 		) as Promise<Input>;
// 	}
// }

type NilEnumDef<T extends NilNumber, O extends readonly string[] | string[]> = {
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

	_decode(ctx: DecodeContext<T['_input']>) {
		return this._def.type._decode(ctx);
	}

	_encode(ctx: ParseContext<T['_input']>) {
		this._def.type._encode(ctx);
	}

	async _afterDecode(ctx: TransformContext<T['_input']>) {
		const { value } = ctx;
		const option = this._def.options[value];
		if (option === undefined)
			throw new NilError(
				`Invalid index "${value}" for enum "[${this._def.options}]"`,
				ctx
			);
		return option;
	}

	async _beforeEncode(ctx: TransformContext<O[number]>) {
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
) => new NilArray({ schema, length });
// const object = <T extends NilRawShape>(shape: T) => new NilObject({ shape });
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
	// object,
	enum_ as enum,
	undefined_ as undefined
};
