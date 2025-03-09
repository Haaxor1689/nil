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
	readonly view: DataView;
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
		.map(p => (typeof p !== 'string' ? `[${p}]` : p === '~' ? '~' : `.${p}`))
		.join('');
