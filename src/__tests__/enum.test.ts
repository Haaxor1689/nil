import { expect, test, describe } from '@jest/globals';
import { n } from '../index';

describe('enum', () => {
	test('default', async () => {
		const schema = n.enum(n.uint8(), ['A', 'B', 'C']);
		const buffer = await schema.toBuffer('B');
		expect(buffer).toEqual(new Uint8Array([1]));
		expect(await schema.fromBuffer(buffer)).toEqual('B');
	});

	test('invalid value throws', async () => {
		const schema = n.enum(n.uint8(), ['A', 'B', 'C']);
		await expect(schema.toBuffer('D' as never)).rejects.toThrow(
			'NilError: Invalid value "D" for enum "[A,B,C]"'
		);
		await expect(schema.fromBuffer(new Uint8Array([3]))).rejects.toThrow(
			'NilError: Invalid index "3" for enum "[A,B,C]"'
		);
	});

	test('int32 type', async () => {
		const schema = n.enum(n.int32(), ['X', 'Y', 'Z']);
		const buffer = await schema.toBuffer('Y');
		expect(buffer).toEqual(new Uint8Array([1, 0, 0, 0]));
		expect(await schema.fromBuffer(buffer)).toEqual('Y');
	});

	test('floating type throws', async () => {
		expect(() => n.enum(n.float(), ['A', 'B', 'C'])).toThrow(
			'Enums can only be created with integer types.'
		);
	});

	test('empty options throws', async () => {
		expect(() => n.enum(n.uint8(), [])).toThrow(
			'Enum options must have at least one option.'
		);
	});

	test('too many options throws', async () => {
		expect(() =>
			n.enum(n.uint8(), [...Array(Math.pow(8, 2) + 1).keys()].map(String))
		).toThrow('Too many options (65) for 1 byte underlying type.');
	});

	test('options', () => {
		const schema = n.enum(n.uint8(), ['A', 'B', 'C']);
		expect(schema.options).toEqual(['A', 'B', 'C']);
	});
});
