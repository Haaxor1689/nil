export type ParsePathComponent = string | number;
export type ParsePath = ParsePathComponent[];

export type ParseContext = {
	readonly path: ParsePath;
	readonly parent?: ParseContext;
	readonly value: Record<string, unknown>;
};

export type ParseInput = {
	data: Buffer;
	path: ParsePath;
	parent: ParseContext;
};

export const resolvePath = (path: ParsePath, ctx?: ParseContext) => {
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
