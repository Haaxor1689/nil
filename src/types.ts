import {
	resolvePath,
	type ParseContext,
	type ParsePath
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

export type objectOutputType<Shape extends NilRawShape> = flatten<
	addQuestionMarks<baseObjectOutputType<Shape>>
>;

type baseObjectOutputType<Shape extends NilRawShape> = {
	[k in keyof Shape]: Shape[k]['_output'];
};

type TransformType<Output = any, Input = Output> = [
	afterDecode: (v: Input, ctx?: ParseContext) => Promise<Output> | Output,
	beforeEncode: (v: Output, ctx?: ParseContext) => Promise<Input> | Input
];

export abstract class NilType<Output = any, Def = object, Input = Output> {
	readonly _def: Def;
	readonly _output!: Output;
	readonly _input!: Input;

	abstract _decode(data: DataView, ctx?: ParseContext): Input;
	abstract _encode(data: DataView, value: Input, ctx?: ParseContext): void;

	async _afterDecode(value: Input, _ctx?: ParseContext): Promise<Output> {
		return value as never;
	}

	async _beforeEncode(value: Output, _ctx?: ParseContext): Promise<Input> {
		return value as never;
	}

	abstract size(value?: Input, ctx?: ParseContext): number;

	async fromBuffer(data: Uint8Array): Promise<Output> {
		const view = new DataView(data.buffer);
		const val = this._decode(view);
		return await this._afterDecode(val);
	}

	async toBuffer(value: Output): Promise<Uint8Array> {
		const val = await this._beforeEncode(value);
		const buffer = new Uint8Array(this.size(val));
		const view = new DataView(buffer.buffer);
		this._encode(view, val);
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
	size(value?: Input, ctx?: ParseContext) {
		return this._def.schema.size(value, ctx);
	}

	_decode(data: DataView, ctx?: ParseContext) {
		return this._def.schema._decode(data, ctx);
	}

	_encode(data: DataView, value: Input, ctx?: ParseContext) {
		this._def.schema._encode(data, value, ctx);
	}

	async _afterDecode(value: Input, ctx?: ParseContext) {
		const { schema } = this._def;
		return await this._def.transform[0](
			await schema._afterDecode(value, ctx),
			ctx
		);
	}

	async _beforeEncode(value: Output, ctx?: ParseContext) {
		const { schema } = this._def;
		return await schema._beforeEncode(
			await this._def.transform[1](value, ctx),
			ctx
		);
	}
}

export class NilBool extends NilType<boolean> {
	size() {
		return 1;
	}

	_decode(data: DataView) {
		const value = data.getInt8(0);
		switch (data.getInt8(0)) {
			case 0:
				return false;
			case 1:
				return true;
			default:
				throw new Error(`Invalid value ${value} for a boolean`);
		}
	}

	_encode(data: DataView, value: boolean) {
		data.setInt8(0, value ? 1 : 0);
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

	_decode(data: DataView) {
		const { bytes, signed, floating, bigEndian: be } = this._def;
		if (floating) {
			switch (bytes) {
				case 4:
					return data.getFloat32(0, !be);
				case 8:
					return data.getFloat64(0, !be);
				default:
					throw new Error(
						`Invalid byte size ${bytes} for a floating point number`
					);
			}
		}
		switch (bytes) {
			case 1:
				return signed ? data.getInt8(0) : data.getUint8(0);
			case 2:
				return signed ? data.getInt16(0, !be) : data.getUint16(0, !be);
			case 4:
				return signed ? data.getInt32(0, !be) : data.getUint32(0, !be);
			case 8:
				throw new Error('For parsing 8 byte numbers us n.bigint');
		}
	}

	_encode(data: DataView, value: number) {
		const { bytes, signed, floating, bigEndian: be } = this._def;
		if (floating) {
			switch (bytes) {
				case 4:
					return data.setFloat32(0, value, !be);
				case 8:
					return data.setFloat64(0, value, !be);
				default:
					throw new Error(
						`Invalid byte size ${bytes} for a floating point number`
					);
			}
		}
		switch (bytes) {
			case 1:
				return signed ? data.setInt8(0, value) : data.setUint8(0, value);
			case 2:
				return signed
					? data.setInt16(0, value, !be)
					: data.setUint16(0, value, !be);
			case 4:
				return signed
					? data.setInt32(0, value, !be)
					: data.setUint32(0, value, !be);
			case 8:
				throw new Error('For parsing 8 byte numbers us n.bigint');
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

	_decode(data: DataView) {
		const { signed, bigEndian: be } = this._def;
		return signed ? data.getBigInt64(0, !be) : data.getBigUint64(0, !be);
	}

	_encode(data: DataView, value: bigint) {
		const { signed, bigEndian: be } = this._def;
		signed ? data.setBigInt64(0, value, !be) : data.setBigUint64(0, value, !be);
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
	size(value?: string, ctx?: ParseContext) {
		const { length, inBytes } = this._def;

		let byteLength = 0;
		if (length === 'fill') {
			byteLength = !value ? -1 : value?.length;
		} else if (typeof length !== 'number') {
			const resolved = resolvePath(length, ctx);
			if (!resolved || typeof resolved !== 'number')
				throw new Error(
					`Data referenced by path "${length}" did not resolve to a number. Resolved value = ${resolved}`
				);
			byteLength = resolved;
		} else {
			byteLength = length / (inBytes ? 8 : 1);
		}

		if (value !== undefined && value.length !== byteLength)
			throw new Error(
				`Given string "${value}" has different size (${value.length}) then allocated space (${byteLength})`
			);
		return byteLength;
	}

	_decode(data: DataView) {
		const decoder = new TextDecoder(this._def.encoding ?? 'utf-8');
		return decoder.decode(
			new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
		);
	}

	_encode(data: DataView, value: string) {
		const encoder = new TextEncoder();
		const buffer = encoder.encode(value);
		buffer.forEach((v, i) => data.setInt8(i, v));
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
	size(value?: T['_input'][], ctx?: ParseContext) {
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

	_decode(data: DataView, ctx?: ParseContext) {
		const { schema } = this._def;
		const value: T['_input'][] = [];

		const elementSize = this.#elementSize(undefined, ctx);
		const size = this.size(undefined, ctx);
		const step = size === -1 ? data.byteLength : size;

		let offset = 0;
		while (offset < step) {
			const newCtx: ParseContext = {
				// FIXME: Types
				value: value as never,
				path: [...(ctx?.path ?? []), value.length],
				parent: ctx
			};
			const view = new DataView(
				data.buffer,
				data.byteOffset + offset,
				elementSize
			);
			value.push(schema._decode(view, newCtx));
			offset += elementSize;
		}

		return value;
	}

	_encode(data: DataView, value: T['_input'][], ctx?: ParseContext) {
		const { schema } = this._def;

		const elementSize = this.#elementSize(undefined, ctx);

		let offset = 0;
		value.forEach((v, i) => {
			const newCtx: ParseContext = {
				// FIXME: Types
				value: value as never,
				path: [...(ctx?.path ?? []), i],
				parent: ctx
			};
			const view = new DataView(
				data.buffer,
				data.byteOffset + offset,
				elementSize
			);
			schema._encode(view, v, newCtx);
			offset += elementSize;
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

	async _beforeEncode(value: T['_output'][], ctx?: ParseContext) {
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

	#elementSize(value?: T['_input'][], ctx?: ParseContext) {
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
	size(value?: Input, ctx?: ParseContext) {
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

	_decode(data: DataView, ctx?: ParseContext) {
		const { shape } = this._def;
		const value: Partial<Input> = {};

		let offset = 0;
		Object.entries(shape).forEach(([k, v]) => {
			const newCtx: ParseContext = {
				value,
				path: [...(ctx?.path ?? []), k],
				parent: ctx
			};
			const size = v.size(value[k as keyof Input], newCtx);
			const step = size === -1 ? data.byteLength - offset : size;
			const view = new DataView(data.buffer, data.byteOffset + offset, step);
			value[k as keyof Input] = v._decode(view, newCtx);
			offset += step;
		});

		return value as Input;
	}

	_encode(data: DataView, value: Input, ctx?: ParseContext) {
		const { shape } = this._def;

		let offset = 0;
		Object.entries(shape).forEach(([k, v]) => {
			const newCtx: ParseContext = {
				// FIXME: Types
				value: value as never,
				path: [...(ctx?.path ?? []), k],
				parent: ctx
			};
			const size = v.size(value[k as keyof Input], newCtx);
			const view = new DataView(data.buffer, data.byteOffset + offset, size);
			v._encode(view, value[k as keyof Input], newCtx);
			offset += size;
		});
	}

	async _afterDecode(value: Input, ctx?: ParseContext) {
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
	size(value?: Uint8Array, ctx?: ParseContext) {
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

	_decode(data: DataView) {
		return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	}

	_encode(data: DataView, value: Uint8Array) {
		for (let i = 0; i < value.length; i++) {
			data.setUint8(i, value[i]);
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

	_decode(data: DataView) {
		return this._def.type._decode(data);
	}

	_encode(data: DataView, value: number) {
		this._def.type._encode(data, value);
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
