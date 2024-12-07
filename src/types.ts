import {
	resolvePath,
	type ParseContext,
	type ParsePath,
	BeforeEncodeContext,
	DecodeContext,
	NilError
} from './helpers/parseUtil';
import {
	parallelMap,
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
	afterDecode: (ctx: ParseContext<Input>) => Promise<Output> | Output,
	beforeEncode: (ctx: BeforeEncodeContext<Output>) => Promise<Input> | Input
];

export abstract class NilType<Output = any, Def = object, Input = Output> {
	readonly _def: Def;
	readonly _output!: Output;
	readonly _input!: Input;

	abstract _decode(ctx: DecodeContext<Input>): Input;
	abstract _encode(ctx: ParseContext<Input>): void;

	async _afterDecode(ctx: ParseContext<Input>): Promise<Output> {
		return ctx.value as never;
	}

	async _beforeEncode(ctx: BeforeEncodeContext<Output>): Promise<Input> {
		return ctx.value as never;
	}

	abstract size(ctx: BeforeEncodeContext<Input>): number;

	async fromBuffer(buffer: Uint8Array): Promise<Output> {
		const data = new DataView(buffer.buffer);
		const ctx = { path: [], data, offset: 0, size: buffer.length };
		const value = this._decode(ctx);
		return this._afterDecode({ ...ctx, value });
	}

	async toBuffer(v: Output): Promise<Uint8Array> {
		const ctx = { path: [], offset: 0 };
		const value = await this._beforeEncode({ ...ctx, value: v });
		const size = this.size({ ...ctx, value });
		const buffer = new Uint8Array(size);
		const data = new DataView(buffer.buffer);
		this._encode({ ...ctx, value, data, size: buffer.length });
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
	size(ctx: BeforeEncodeContext<Input>) {
		return this._def.schema.size(ctx);
	}

	_decode(ctx: ParseContext) {
		return this._def.schema._decode(ctx);
	}

	_encode(ctx: ParseContext<Input>) {
		this._def.schema._encode(ctx);
	}

	async _afterDecode(ctx: ParseContext<Input>): Promise<Output> {
		const { schema } = this._def;
		const value = await schema._afterDecode(ctx);
		return this._def.transform[0]({ ...ctx, value });
	}

	async _beforeEncode(ctx: BeforeEncodeContext<Output>): Promise<Input> {
		const { schema } = this._def;
		const value = await this._def.transform[1](ctx);
		return schema._beforeEncode({ ...ctx, value });
	}
}

export class NilBool extends NilType<boolean> {
	size() {
		return 1;
	}

	_decode(ctx: DecodeContext<boolean>) {
		const { data, offset } = ctx;
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
		if (floating) {
			switch (bytes) {
				case 4:
					return data.getFloat32(offset, !be);
				case 8:
					return data.getFloat64(offset, !be);
				default:
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
				throw new NilError('For parsing 8 byte numbers us n.bigint', ctx);
		}
	}

	_encode(ctx: ParseContext<number>) {
		const { data, offset, value } = ctx;
		const { bytes, signed, floating, bigEndian: be } = this._def;
		if (floating) {
			switch (bytes) {
				case 4:
					return data.setFloat32(offset, value, !be);
				case 8:
					return data.setFloat64(offset, value, !be);
				default:
					throw new NilError(
						`Invalid byte size ${bytes} for a floating point number`,
						ctx
					);
			}
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
			case 8:
				throw new NilError('For parsing 8 byte numbers us n.bigint', ctx);
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

	_decode({ data, offset }: DecodeContext<bigint>) {
		const { signed, bigEndian: be } = this._def;
		return signed
			? data.getBigInt64(offset, !be)
			: data.getBigUint64(offset, !be);
	}

	_encode({ data, offset, value }: ParseContext<bigint>) {
		const { signed, bigEndian: be } = this._def;
		signed
			? data.setBigInt64(offset, value, !be)
			: data.setBigUint64(offset, value, !be);
	}

	be() {
		this._def.bigEndian = true;
		return this;
	}
}

type NilStringDef = {
	length: number | ParsePath | 'fill';
	inBytes?: boolean;
	encoding?: string;
};

export class NilString extends NilType<string, NilStringDef> {
	size(ctx: BeforeEncodeContext<string>) {
		const { length, inBytes } = this._def;

		let byteLength = 0;
		if (length === 'fill') {
			byteLength = !ctx.value ? -1 : ctx.value.length;
		} else if (typeof length !== 'number') {
			const resolved = resolvePath(length, ctx);
			if (!resolved || typeof resolved !== 'number')
				throw new NilError(
					`Data referenced by path "${length}" did not resolve to a number. Resolved value = ${resolved}`,
					ctx
				);
			byteLength = resolved;
		} else {
			byteLength = length / (inBytes ? 8 : 1);
		}

		if (ctx.value !== undefined && ctx.value.length !== byteLength)
			throw new NilError(
				`Given string "${ctx.value}" has different size (${ctx.value.length}) then allocated space (${byteLength})`,
				ctx
			);
		return byteLength;
	}

	_decode({ data, offset, size }: DecodeContext<string>) {
		const decoder = new TextDecoder(this._def.encoding ?? 'utf-8');
		return decoder.decode(new DataView(data.buffer, offset, size));
	}

	_encode({ data, offset, value }: ParseContext<string>) {
		const encoder = new TextEncoder();
		// TODO: Optimize
		const buffer = encoder.encode(value);
		buffer.forEach((v, i) => data.setInt8(offset + i, v));
	}

	bytes() {
		if (typeof this._def.length !== 'number')
			throw new Error(
				`Can't set string length to bytes when it's defined by a path.`
			);
		if (this._def.length % 8)
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
	size(ctx: Partial<ParseContext>) {
		const { length, inBytes } = this._def;

		const elementSize = this.#elementSize(value, ctx);
		if (elementSize === -1) return -1;

		let byteLength = 0;
		if (length === 'fill') {
			byteLength = !value ? -1 : value?.length * elementSize;
		} else if (typeof length !== 'number') {
			const resolved = resolvePath(length, ctx);
			if (!resolved || typeof resolved !== 'number')
				throw new Error(
					`Data referenced by path "${length}" did not resolve to a number. Resolved value = ${resolved}`
				);

			byteLength = resolved * elementSize;
		} else if (inBytes) {
			byteLength = length / 8;
		} else {
			byteLength = length * elementSize;
		}
		return byteLength;
	}

	_decode({ data, offset }: ParseContext) {
		const { schema } = this._def;
		const value: T['_input'][] = [];

		const elementSize = this.#elementSize(undefined, ctx);
		const size = this.size(undefined, ctx);
		const step = size === -1 ? data.byteLength - offset : size;

		let currentOffset = offset;
		while (currentOffset < step) {
			value.push(
				schema._decode(data, currentOffset, {
					// FIXME: Types
					value: value as never,
					path: [...(ctx?.path ?? []), value.length],
					parent: ctx
				})
			);
			currentOffset += elementSize;
		}

		return value;
	}

	_encode(value: T['_input'][], { data, offset }: ParseContext) {
		const { schema } = this._def;

		const elementSize = this.#elementSize(undefined, ctx);

		let currentOffset = offset;
		value.forEach((v, i) => {
			schema._encode(data, currentOffset, v, {
				// FIXME: Types
				value: value as never,
				path: [...(ctx?.path ?? []), i],
				parent: ctx
			});
			currentOffset += elementSize;
		});
	}

	async _afterDecode(value: T['_input'][], ctx?: ParseContext) {
		const { schema } = this._def;

		const arr = [];
		for (let i = 0; i < value.length; i++) {
			const v = value[i];
			const newCtx: ParseContext = {
				// FIXME: Types
				value: value as never,
				path: [...(ctx?.path ?? []), i],
				parent: ctx
			};
			arr.push(await schema._afterDecode(v, newCtx));
		}
		return arr;
	}

	async _beforeEncode(value: T['_output'][], ctx: ParseContext) {
		const { schema } = this._def;
		const arr = [];
		for (let i = 0; i < value.length; i++) {
			const v = value[i];
			const newCtx: ParseContext = {
				// FIXME: Types
				value: value as never,
				path: [...(ctx?.path ?? []), i],
				parent: ctx
			};
			arr.push(await schema._beforeEncode(v, newCtx));
		}
		return arr;
	}

	#elementSize(value?: T['_input'][], ctx: ParseContext) {
		const { schema } = this._def;
		const newCtx: ParseContext = {
			// FIXME: Types
			value: value as never,
			path: [...(ctx?.path ?? []), 0],
			parent: ctx
		};
		// FIXME: Types
		return schema.size((value as any)?.[0], newCtx);
	}

	bytes() {
		if (typeof this._def.length !== 'number')
			throw new Error(
				`Can't set string length to bytes when it's defined by a path.`
			);
		if (this._def.length % 8)
			throw new Error(`Byte size ${this._def.length} is not divisible by 8.`);
		this._def.inBytes = true;
		return this;
	}
}

type NilObjectDef<T extends NilRawShape = NilRawShape> = {
	shape: T;
};

class NilObject<
	T extends NilRawShape,
	Output = objectOutputType<T>,
	Input = Output
> extends NilType<Output, NilObjectDef<T>, Input> {
	size(ctx: Partial<ParseContext>) {
		const { shape } = this._def;
		return Object.entries(shape).reduce((acc, [k, v]) => {
			if (acc === -1) return -1;
			const newCtx: ParseContext = {
				// FIXME: Types
				value: value as never,
				path: [...(ctx?.path ?? []), k],
				parent: ctx
			};
			const size = v.size(value?.[k as keyof Input], newCtx);
			return size === -1 ? -1 : acc + size;
		}, 0);
	}

	_decode({ data, offset }: ParseContext) {
		const { shape } = this._def;
		const value: Partial<Input> = {};

		let currentOffset = offset;
		Object.entries(shape).forEach(([k, v]) => {
			const newCtx: ParseContext = {
				value,
				path: [...(ctx?.path ?? []), k],
				parent: ctx
			};
			const size = v.size(undefined, newCtx);
			const step = size === -1 ? data.byteLength - currentOffset : size;
			value[k as keyof Input] = v._decode(data, currentOffset, newCtx);
			currentOffset += step;
		});

		return value as Input;
	}

	_encode(value: Input, { data, offset }: ParseContext) {
		const { shape } = this._def;

		let currentOffset = offset;
		Object.entries(shape).forEach(([k, v]) => {
			const newCtx: ParseContext = {
				// FIXME: Types
				value: value as never,
				path: [...(ctx?.path ?? []), k],
				parent: ctx
			};
			const size = v.size(value[k as keyof Input], newCtx);
			v._encode(data, currentOffset, value[k as keyof Input], newCtx);
			currentOffset += size;
		});
	}

	async _afterDecode(value: Input, ctx: ParseContext) {
		const { shape } = this._def;
		return parallelMap(shape, async (v, k) =>
			v._afterDecode(value[k as keyof Input], {
				// FIXME: Types
				value: value as never,
				path: [...(ctx?.path ?? []), k],
				parent: ctx
			})
		) as Promise<Output>;
	}

	async _beforeEncode(value: Output, ctx?: ParseContext) {
		const { shape } = this._def;
		return parallelMap(shape, async (v, k) =>
			v._beforeEncode(value[k as keyof Output], {
				// FIXME: Types
				value: value as never,
				path: [...(ctx?.path ?? []), k],
				parent: ctx
			})
		) as Promise<Input>;
	}
}

type NilBufferDef = {
	length: number | ParsePath | 'fill';
	inBytes?: boolean;
};

class NilBuffer extends NilType<Uint8Array, NilBufferDef> {
	size(ctx: Partial<ParseContext>) {
		const { length, inBytes } = this._def;

		let byteLength = 0;
		if (length === 'fill') {
			byteLength = value?.length ?? -1;
		} else if (typeof length !== 'number') {
			const resolved = resolvePath(length, ctx);
			if (!resolved || typeof resolved !== 'number')
				throw new Error(
					`Data referenced by path "${length}" did not resolve to a number.`
				);

			byteLength = resolved;
		} else {
			byteLength = length / (inBytes ? 8 : 1);
		}
		return byteLength;
	}

	_decode({ data, offset }: ParseContext) {
		return new Uint8Array(
			data.buffer,
			data.byteOffset + offset,
			data.byteLength - offset
		);
	}

	_encode(value: Uint8Array, { data, offset }: ParseContext) {
		for (let i = 0; i < value.length; i++) {
			data.setUint8(offset + i, value[i]);
		}
	}

	bytes() {
		if (typeof this._def.length !== 'number')
			throw new Error(
				`Can't set buffer length to bytes when it's defined by a path.`
			);
		if (this._def.length % 8)
			throw new Error(`Byte size ${this._def.length} is not divisible by 8.`);
		this._def.inBytes = true;
		return this;
	}
}

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

	_decode(ctx: ParseContext) {
		return this._def.type._decode(ctx);
	}

	_encode(value: number, ctx: ParseContext) {
		this._def.type._encode(value, ctx);
	}

	async _afterDecode(value: T['_input']) {
		const option = this._def.options[value];
		if (option === undefined)
			throw new Error(
				`Invalid index "${value}" for enum "[${this._def.options}]"`
			);
		return option;
	}

	async _beforeEncode(value: O[number]) {
		const index = this._def.options.indexOf(value);
		if (index === -1)
			throw new Error(
				`Invalid value "${value}" for enum "[${this._def.options}]"`
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
const string = (length: NilStringDef['length']) => new NilString({ length });
const array = <T extends NilTypeAny>(
	schema: T,
	length: NilArrayDef<T>['length']
) => new NilArray({ schema, length });
const object = <T extends NilRawShape>(shape: T) => new NilObject({ shape });
const buffer = (length: NilBufferDef['length']) => new NilBuffer({ length });
const enum_ = <
	T extends NilNumber,
	const O extends readonly string[] | string[]
>(
	type: T,
	options: O
): NilEnum<T, O> => new NilEnum({ type, options });
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
	string,
	array,
	object,
	buffer,
	enum_ as enum,
	undefined_ as undefined
};
