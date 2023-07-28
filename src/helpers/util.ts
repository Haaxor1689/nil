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
type ObjectMapper<T, U> = (value: T, key: string) => U;
export const mapValues = <T, U>(
	obj: Record<string, T>,
	mapper: ObjectMapper<T, U>
): Record<string, U> => {
	const result: Record<string, U> = {};

	for (const key in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			result[key] = mapper(obj[key], key);
		}
	}

	return result;
};
