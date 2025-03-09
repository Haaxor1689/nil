import { expect, test, describe } from '@jest/globals';

import { n } from '../index';

describe('array', () => {
	describe('fixed length', () => {
		test('default', async () => {
			const schema = n.array(n.uint8(), 3);
			const buffer = await schema.toBuffer([1, 2, 3]);
			expect(buffer).toEqual(new Uint8Array([1, 2, 3]));
			expect(await schema.fromBuffer(buffer)).toEqual([1, 2, 3]);
		});

		test('empty', async () => {
			const schema = n.array(n.uint8(), 0);
			const buffer = await schema.toBuffer([]);
			expect(buffer).toEqual(new Uint8Array([]));
			expect(await schema.fromBuffer(buffer)).toEqual([]);
		});

		test('too short', async () => {
			const schema = n.array(n.uint8(), 3);
			await expect(schema.toBuffer([1, 2])).rejects.toThrow(
				'NilError: Array length 2 is smaller than expected length'
			);
		});

		test('too long', async () => {
			const schema = n.array(n.uint8(), 3);
			await expect(schema.toBuffer([1, 2, 3, 4])).rejects.toThrow(
				'NilError: Array length 4 is larger than expected length'
			);
		});

		test('nested', async () => {
			const schema = n.array(n.array(n.uint8(), 2), 2);
			const buffer = await schema.toBuffer([
				[1, 2],
				[3, 4]
			]);
			expect(buffer).toEqual(new Uint8Array([1, 2, 3, 4]));
			expect(await schema.fromBuffer(buffer)).toEqual([
				[1, 2],
				[3, 4]
			]);
		});
	});

	describe('fill length', () => {
		test('default', async () => {
			const schema = n.array(n.uint8(), 'fill');
			const buffer = await schema.toBuffer([1, 2, 3]);
			expect(buffer).toEqual(new Uint8Array([1, 2, 3]));
			expect(await schema.fromBuffer(buffer)).toEqual([1, 2, 3]);
		});

		test('empty', async () => {
			const schema = n.array(n.uint8(), 'fill');
			const buffer = await schema.toBuffer([]);
			expect(buffer).toEqual(new Uint8Array([]));
			expect(await schema.fromBuffer(buffer)).toEqual([]);
		});
	});

	describe('path length', () => {
		test('default', async () => {
			const schema = n.object({
				a: n.uint8(),
				b: n.array(n.uint8(), ['a'])
			});
			const buffer = await schema.toBuffer({ a: 3, b: [1, 2, 3] });
			expect(buffer).toEqual(new Uint8Array([3, 1, 2, 3]));
			expect(await schema.fromBuffer(buffer)).toEqual({ a: 3, b: [1, 2, 3] });
		});

		test('nested', async () => {
			const schema = n.object({
				a: n.object({ len: n.uint8() }),
				b: n.object({ arr: n.array(n.uint8(), ['^', 'a', 'len']) })
			});
			const buffer = await schema.toBuffer({
				a: { len: 3 },
				b: { arr: [1, 2, 3] }
			});
			expect(buffer).toEqual(new Uint8Array([3, 1, 2, 3]));
			expect(await schema.fromBuffer(buffer)).toEqual({
				a: { len: 3 },
				b: { arr: [1, 2, 3] }
			});
		});

		test('invalid', async () => {
			const schema = n.object({
				a: n.bool(),
				b: n.array(n.uint8(), ['a'])
			});
			await expect(schema.toBuffer({ a: false, b: [1, 2, 3] })).rejects.toThrow(
				'NilError: Invalid length false resolved from .a'
			);
			await expect(
				schema.fromBuffer(new Uint8Array([0, 1, 2, 3]))
			).rejects.toThrow('NilError: Invalid length false resolved from .a');
		});

		test('invalid parent', async () => {
			const schema = n.object({
				a: n.uint8(),
				b: n.array(n.uint8(), ['^'])
			});
			await expect(schema.toBuffer({ a: 3, b: [1, 2, 3] })).rejects.toThrow(
				'NilError: Failed to resolve .^, no parent found'
			);
		});

		test('invalid path', async () => {
			const schema = n.object({
				a: n.uint8(),
				b: n.array(n.uint8(), ['c'])
			});
			await expect(schema.toBuffer({ a: 3, b: [1, 2, 3] })).rejects.toThrow(
				'NilError: Failed to resolve .c on { a, b }, key not found'
			);
		});

		test('wrong order', async () => {
			const schema = n.object({
				a: n.array(n.uint8(), ['b']),
				b: n.uint8()
			});
			await expect(schema.toBuffer({ a: [1, 2, 3], b: 3 })).rejects.toThrow(
				'NilError: Failed to resolve .b on { a, b } from element a, you can only reference keys defined before the current one.'
			);
		});

		test('wrong order nested', async () => {
			const schema = n.object({
				a: n.object({ arr: n.array(n.uint8(), ['^', 'b', 'len']) }),
				b: n.object({ len: n.uint8() })
			});
			await expect(
				schema.toBuffer({ a: { arr: [1, 2, 3] }, b: { len: 3 } })
			).rejects.toThrow(
				'NilError: Failed to resolve .b.len on { a, b } from element a, you can only reference keys defined before the current one.'
			);
		});
	});

	describe('byte length', () => {
		test('default', async () => {
			const schema = n.array(n.uint8(), 24).bytes();
			const buffer = await schema.toBuffer([1, 2, 3]);
			expect(buffer).toEqual(new Uint8Array([1, 2, 3]));
			expect(await schema.fromBuffer(buffer)).toEqual([1, 2, 3]);
		});

		test('empty', async () => {
			const schema = n.array(n.uint8(), 0).bytes();
			const buffer = await schema.toBuffer([]);
			expect(buffer).toEqual(new Uint8Array([]));
			expect(await schema.fromBuffer(buffer)).toEqual([]);
		});

		test('too short', async () => {
			const schema = n.array(n.uint8(), 80).bytes();
			await expect(schema.toBuffer([1, 2, 3])).rejects.toThrow(
				'NilError: Array length 3 is smaller than expected length'
			);
		});

		test('too long', async () => {
			const schema = n.array(n.uint8(), 24).bytes();
			await expect(schema.toBuffer([1, 2, 3, 4])).rejects.toThrow(
				'NilError: Array length 4 is larger than expected length'
			);
		});

		test('wrong length', async () => {
			const cb = () => n.array(n.uint8(), 3).bytes();
			expect(cb).toThrow(Error);
			expect(cb).toThrow('Byte size 3 is not divisible by 8.');
		});

		test('throws based on length type', async () => {
			expect(() => n.array(n.uint8(), 'fill').bytes()).toThrow(
				"Can't set bytes on dynamic length array."
			);
			expect(() => n.array(n.uint8(), 80).bytes()).not.toThrow();
			expect(() => n.array(n.uint8(), ['foo']).bytes()).not.toThrow();
		});
	});

	describe('array path length', () => {
		test('default', async () => {
			const schema = n.object({
				a: n.array(n.uint8(), 3),
				b: n.array(n.uint8(), ['a', 0])
			});
			const buffer = await schema.toBuffer({ a: [3, 2, 1], b: [1, 2, 3] });
			expect(buffer).toEqual(new Uint8Array([3, 2, 1, 1, 2, 3]));
			expect(await schema.fromBuffer(buffer)).toEqual({
				a: [3, 2, 1],
				b: [1, 2, 3]
			});
		});

		test('nested', async () => {
			const schema = n.object({
				a: n.object({ arr: n.array(n.uint8(), 3) }),
				b: n.object({ arr: n.array(n.uint8(), ['^', 'a', 'arr', 0]) })
			});
			const buffer = await schema.toBuffer({
				a: { arr: [3, 2, 1] },
				b: { arr: [1, 2, 3] }
			});
			expect(buffer).toEqual(new Uint8Array([3, 2, 1, 1, 2, 3]));
			expect(await schema.fromBuffer(buffer)).toEqual({
				a: { arr: [3, 2, 1] },
				b: { arr: [1, 2, 3] }
			});
		});

		test('invalid', async () => {
			const schema = n.object({
				a: n.array(n.bool(), 1),
				b: n.array(n.uint8(), ['a', 0])
			});
			await expect(
				schema.toBuffer({ a: [false], b: [1, 2, 3] })
			).rejects.toThrow('NilError: Invalid length false resolved from .a[0]');
			await expect(
				schema.fromBuffer(new Uint8Array([0, 1, 2, 3]))
			).rejects.toThrow('NilError: Invalid length false resolved from .a[0]');
		});

		test('invalid parent', async () => {
			const schema = n.array(n.array(n.uint8(), ['^']), 1);
			await expect(schema.toBuffer([[1, 2, 3]])).rejects.toThrow(
				'NilError: Failed to resolve .^, no parent found'
			);
		});

		test('invalid path', async () => {
			const schema = n.object({
				a: n.array(n.uint8(), 1),
				b: n.array(n.uint8(), ['c', 1])
			});
			await expect(schema.toBuffer({ a: [3], b: [1, 2, 3] })).rejects.toThrow(
				'NilError: Failed to resolve .c[1] on { a, b }, key not found'
			);
		});

		test('invalid string path', async () => {
			const schema = n.object({
				a: n.array(n.uint8(), 1),
				b: n.array(n.uint8(), ['a', 'c'])
			});
			await expect(schema.toBuffer({ a: [3], b: [1, 2, 3] })).rejects.toThrow(
				'NilError: Invalid key c in path .c, key of an array must be a number'
			);
		});

		test('wrong order', async () => {
			const schema = n.array(n.array(n.uint8(), [1, 3]), 2);
			await expect(
				schema.toBuffer([
					[1, 2, 3],
					[4, 5, 6]
				])
			).rejects.toThrow(
				'NilError: Failed to resolve [1][3] from index 0, you can only reference elements defined before the current one'
			);
		});

		test('wrong order nested', async () => {
			const schema = n.array(
				n.object({ arr: n.array(n.uint8(), ['^', 1, 'arr', 3]) }),
				2
			);
			await expect(
				schema.toBuffer([{ arr: [1, 2, 3] }, { arr: [4, 5, 6] }])
			).rejects.toThrow(
				'NilError: Failed to resolve [1].arr[3] from index 0, you can only reference elements defined before the current one'
			);
		});
	});
});
