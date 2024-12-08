export type ParsePathComponent = string | number;
export type ParsePath = ParsePathComponent[];

export type ParseContext<T = unknown> = {
	readonly path: ParsePath;
	readonly parent?: ParseContext;

	readonly buffer: Uint8Array;
	readonly data: DataView;
	readonly offset: number;

	readonly value: T;
	readonly size: number;
};

export type DecodeContext<T = unknown> = Omit<ParseContext<T>, 'value'>;
export type EncodeContext<T = unknown> = Pick<
	ParseContext<T>,
	'parent' | 'path' | 'value'
>;
export type SizeContext<T = unknown> = Pick<
	ParseContext<T>,
	'parent' | 'path'
> &
	Partial<ParseContext<T>>;

export const resolvePath = (path: ParsePath, ctx?: SizeContext) => {
	let relativeCtx = ctx;
	let relativePath = path;
	while (relativePath[0] === '..') {
		relativeCtx = relativeCtx?.parent;
		relativePath = relativePath.slice(1);
	}
	if (!relativeCtx)
		throw new Error(
			`Failed to resolve path "${path.join('.')}" in context "${JSON.stringify(
				ctx
			)}".`
		);

	let data: unknown = relativeCtx.value;
	while (relativePath.length >= 1) {
		data = (data as any)?.[relativePath[0]];
		relativePath = relativePath.slice(1);
	}
	return data;
};

export class NilError extends Error {
	readonly ctx: Partial<ParseContext>;
	constructor(message: string, ctx: Partial<ParseContext>) {
		super(`NilError: ${message}`);
		this.ctx = ctx;
	}
}
