type requiredKeys<T extends object> = {
	[k in keyof T]: undefined extends T[k] ? never : k;
}[keyof T];

export type addQuestionMarks<
	T extends object,
	R extends keyof T = requiredKeys<T>
> = Pick<Required<T>, R> & Partial<T>;

export type identity<T> = T;
export type flatten<T> = identity<{ [k in keyof T]: T[k] }>;

// FIXME: Improve types
type ObjectMapper<T, U> = (value: T, key: string) => Promise<U>;
export const parallelMap = async <T, U>(
	obj: Record<string, T>,
	mapper: ObjectMapper<T, U>
): Promise<Record<string, U>> =>
	Object.fromEntries(
		await Promise.all(
			Object.entries(obj).map(async ([key, value]) => [
				key,
				await mapper(value, key)
			])
		)
	);
