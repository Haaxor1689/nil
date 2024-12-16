type requiredKeys<T extends object> = {
	[k in keyof T]: undefined extends T[k] ? never : k;
}[keyof T];

export type addQuestionMarks<
	T extends object,
	R extends keyof T = requiredKeys<T>
> = Pick<Required<T>, R> & Partial<T>;

export type identity<T> = T;
export type flatten<T> = identity<{ [k in keyof T]: T[k] }>;

export type ParsePathComponent = string | number;
export type ParsePath = ParsePathComponent[];

export type ParseContext<T = unknown, Def = object> = {
	readonly path: ParsePath;
	readonly parent?: SizeContext;
	readonly _def: Def;

	readonly buffer: Uint8Array;
	readonly offset: number;

	value: T;
	readonly size: number;
};

export type DecodeContext<T = unknown, Def = object> = Omit<
	ParseContext<T, Def>,
	'value'
> &
	Partial<ParseContext<T, Def>>;

export type TransformContext<T = unknown, Def = object> = Pick<
	ParseContext<T, Def>,
	'parent' | 'path' | 'value' | 'offset' | '_def'
>;

export type SizeContext<T = unknown, Def = object> = Pick<
	ParseContext<T, Def>,
	'path' | 'offset' | '_def'
> &
	Partial<ParseContext<T, Def>>;

export type ResolvePathFunc<T = unknown, Def = object> = (
	path: ParsePath,
	ctx: SizeContext<T, Def>,
	from?: SizeContext<T, Def>
) => any;

export const hasResolvePath = (
	obj: unknown
): obj is { _resolvePath: ResolvePathFunc } =>
	!!obj &&
	typeof obj === 'object' &&
	'_resolvePath' in obj &&
	typeof obj._resolvePath === 'function';

export class NilError extends Error {
	readonly ctx: SizeContext;
	constructor(message: string, ctx: SizeContext) {
		super(`NilError: ${message}`);
		this.ctx = ctx;
	}
}

export const formatPath = (path: ParsePath) =>
	path
		.map(p => (typeof p !== 'string' ? `[${p}]` : p === '..' ? '.^' : `.${p}`))
		.join('');

type NumberDef = {
	bytes: 1 | 2 | 4 | 8;
	signed?: boolean;
	bigEndian?: boolean;
};

export const getInt = (
	buffer: Uint8Array,
	offset: number,
	{ bytes, signed, bigEndian }: NumberDef
) => {
	let value = 0;
	for (let i = 0; i < bytes; i++) {
		const byteIndex = bigEndian ? offset + i : offset + (bytes - 1 - i);
		value = (value << 8) | buffer[byteIndex];
	}

	if (signed) {
		const bitLength = bytes * 8;
		const signBit = 1 << (bitLength - 1);
		if (value & signBit) {
			value -= signBit << 1;
		}
	} else {
		// Ensure the result is treated as an unsigned 32-bit number
		value = value >>> 0;
	}

	return value;
};

export const setInt = (
	buffer: Uint8Array,
	offset: number,
	value: number,
	{ bytes, bigEndian }: NumberDef
): void => {
	for (let i = 0; i < bytes; i++) {
		const byte = (value >> (8 * (bigEndian ? bytes - 1 - i : i))) & 0xff;
		buffer[offset + i] = byte;
	}
};

export const getFloat = (
	buffer: Uint8Array,
	offset: number,
	{ bytes, bigEndian }: NumberDef
) => {
	const toBits = (
		buffer: Uint8Array,
		offset: number,
		bytes: number,
		bigEndian?: boolean
	): bigint => {
		let value = BigInt(0);
		for (let i = 0; i < bytes; i++) {
			const byteIndex = bigEndian ? offset + i : offset + (bytes - 1 - i);
			value = (value << BigInt(8)) | BigInt(buffer[byteIndex]);
		}
		return value;
	};

	const rawBits = toBits(buffer, offset, bytes, bigEndian);

	if (bytes === 4) {
		const sign = (rawBits >> BigInt(31)) & BigInt(1);
		const exponent = (rawBits >> BigInt(23)) & BigInt(0xff);
		const fraction = rawBits & BigInt(0x7fffff);

		if (exponent === BigInt(0xff)) {
			return fraction === BigInt(0) ? (sign ? -Infinity : Infinity) : NaN;
		}

		const e = exponent === BigInt(0) ? -126 : Number(exponent) - 127;
		const m =
			exponent === BigInt(0)
				? Number(fraction) / Math.pow(2, 23)
				: 1 + Number(fraction) / Math.pow(2, 23);

		return (sign ? -1 : 1) * m * Math.pow(2, e);
	} else {
		const sign = (rawBits >> BigInt(63)) & BigInt(1);
		const exponent = (rawBits >> BigInt(52)) & BigInt(0x7ff);
		const fraction = rawBits & ((BigInt(1) << BigInt(52)) - BigInt(1));

		if (exponent === BigInt(0x7ff)) {
			return fraction === BigInt(0) ? (sign ? -Infinity : Infinity) : NaN;
		}

		const e = exponent === BigInt(0) ? -1022 : Number(exponent) - 1023;
		const m =
			exponent === BigInt(0)
				? Number(fraction) / Math.pow(2, 52)
				: 1 + Number(fraction) / Math.pow(2, 52);

		return (sign ? -1 : 1) * m * Math.pow(2, e);
	}
};
