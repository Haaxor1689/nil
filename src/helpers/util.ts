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
export const mapValues = async <T, U>(
	obj: Record<string, T>,
	mapper: ObjectMapper<T, U>
): Promise<Record<string, U>> => {
	const result: Record<string, U> = {};

	for (const key in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			result[key] = await mapper(obj[key], key);
		}
	}

	return result;
};
