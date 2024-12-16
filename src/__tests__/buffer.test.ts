import { expect, test, describe } from '@jest/globals';

import { n } from '../index';

describe('buffer', () => {
	describe('set length', () => {
		test('default', async () => {
			const schema = n.buffer(5);
			const buffer = await schema.toBuffer(new Uint8Array([1, 2, 3, 4, 5]));
			expect(buffer).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
			expect(await schema.fromBuffer(buffer)).toEqual(
				new Uint8Array([1, 2, 3, 4, 5])
			);
		});

		test('empty', async () => {
			const schema = n.buffer(0);
			const buffer = await schema.toBuffer(new Uint8Array([]));
			expect(buffer).toEqual(new Uint8Array([]));
			expect(await schema.fromBuffer(buffer)).toEqual(new Uint8Array([]));
		});

		test('too short', async () => {
			const schema = n.buffer(10);
			await expect(
				schema.toBuffer(new Uint8Array([1, 2, 3, 4, 5]))
			).rejects.toThrow(
				'NilError: Buffer length 5 does not match expected length 10'
			);
		});

		test('too long', async () => {
			const schema = n.buffer(5);
			await expect(
				schema.toBuffer(new Uint8Array([1, 2, 3, 4, 5, 6]))
			).rejects.toThrow(
				'NilError: Buffer length 6 does not match expected length 5'
			);
		});

		test('fromBuffer throws when buffer is too small', async () => {
			const schema = n.buffer(5);
			const smallBuffer = new Uint8Array([104, 101, 108]);
			await expect(schema.fromBuffer(smallBuffer)).rejects.toThrow(
				'NilError: Not enough space to decode 5-byte buffer, missing 2 byte(s)'
			);
		});
	});

	describe('byte length', () => {
		test('default', async () => {
			const schema = n.buffer(40).bytes();
			const buffer = await schema.toBuffer(new Uint8Array([1, 2, 3, 4, 5]));
			expect(buffer).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
			expect(await schema.fromBuffer(buffer)).toEqual(
				new Uint8Array([1, 2, 3, 4, 5])
			);
		});

		test('empty', async () => {
			const schema = n.buffer(0).bytes();
			const buffer = await schema.toBuffer(new Uint8Array([]));
			expect(buffer).toEqual(new Uint8Array([]));
			expect(await schema.fromBuffer(buffer)).toEqual(new Uint8Array([]));
		});

		test('too short', async () => {
			const schema = n.buffer(80).bytes();
			await expect(
				schema.toBuffer(new Uint8Array([1, 2, 3, 4, 5]))
			).rejects.toThrow(
				'NilError: Buffer length 5 does not match expected length 10'
			);
		});

		test('too long', async () => {
			const schema = n.buffer(40).bytes();
			await expect(
				schema.toBuffer(new Uint8Array([1, 2, 3, 4, 5, 6]))
			).rejects.toThrow(
				'NilError: Buffer length 6 does not match expected length 5'
			);
		});

		test('wrong length', async () => {
			const cb = () => n.buffer(3).bytes();
			expect(cb).toThrow(Error);
			expect(cb).toThrow('Byte size 3 is not divisible by 8.');
		});

		test('throws based on length type', async () => {
			expect(() => n.buffer('fill').bytes()).toThrow(
				"Can't set bytes on dynamic length buffer."
			);
			expect(() => n.buffer(80).bytes()).not.toThrow();
			expect(() => n.buffer(['foo']).bytes()).not.toThrow();
		});
	});

	describe('fill length', () => {
		test('default', async () => {
			const schema = n.buffer('fill');
			const buffer = await schema.toBuffer(new Uint8Array([1, 2, 3, 4, 5]));
			expect(buffer).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
			expect(await schema.fromBuffer(buffer)).toEqual(
				new Uint8Array([1, 2, 3, 4, 5])
			);
		});

		test('empty', async () => {
			const schema = n.buffer('fill');
			const buffer = await schema.toBuffer(new Uint8Array([]));
			expect(buffer).toEqual(new Uint8Array([]));
			expect(await schema.fromBuffer(buffer)).toEqual(new Uint8Array([]));
		});
	});

	describe('path length', () => {
		test('default', async () => {
			const schema = n.object({
				a: n.uint8(),
				b: n.buffer(['a'])
			});
			const buffer = await schema.toBuffer({
				a: 5,
				b: new Uint8Array([1, 2, 3, 4, 5])
			});
			expect(buffer).toEqual(new Uint8Array([5, 1, 2, 3, 4, 5]));
			expect(await schema.fromBuffer(buffer)).toEqual({
				a: 5,
				b: new Uint8Array([1, 2, 3, 4, 5])
			});
		});

		test('nested', async () => {
			const schema = n.object({
				a: n.object({ len: n.uint8() }),
				b: n.object({ buf: n.buffer(['..', 'a', 'len']) })
			});
			const buffer = await schema.toBuffer({
				a: { len: 5 },
				b: { buf: new Uint8Array([1, 2, 3, 4, 5]) }
			});
			expect(buffer).toEqual(new Uint8Array([5, 1, 2, 3, 4, 5]));
			expect(await schema.fromBuffer(buffer)).toEqual({
				a: { len: 5 },
				b: { buf: new Uint8Array([1, 2, 3, 4, 5]) }
			});
		});

		test('invalid', async () => {
			const schema = n.object({
				a: n.bool(),
				b: n.buffer(['a'])
			});
			await expect(
				schema.toBuffer({ a: false, b: new Uint8Array([1, 2, 3, 4, 5]) })
			).rejects.toThrow('NilError: Invalid length false resolved from .a');
			await expect(
				schema.fromBuffer(new Uint8Array([0, 1, 2, 3, 4, 5]))
			).rejects.toThrow('NilError: Invalid length false resolved from .a');
		});

		test('invalid parent', async () => {
			const schema = n.object({
				a: n.uint8(),
				b: n.buffer(['..'])
			});
			await expect(
				schema.toBuffer({ a: 5, b: new Uint8Array([1, 2, 3, 4, 5]) })
			).rejects.toThrow('NilError: Failed to resolve .^, no parent found');
		});

		test('invalid path', async () => {
			const schema = n.object({
				a: n.uint8(),
				b: n.buffer(['c'])
			});
			await expect(
				schema.toBuffer({ a: 5, b: new Uint8Array([1, 2, 3, 4, 5]) })
			).rejects.toThrow(
				'NilError: Failed to resolve .c on { a, b }, key not found'
			);
		});

		test('wrong order', async () => {
			const schema = n.object({
				a: n.buffer(['b']),
				b: n.uint8()
			});
			await expect(
				schema.toBuffer({ a: new Uint8Array([1, 2, 3, 4, 5]), b: 5 })
			).rejects.toThrow(
				'NilError: Failed to resolve .b on { a, b } from element a, you can only reference keys defined before the current one.'
			);
		});

		test('wrong order nested', async () => {
			const schema = n.object({
				a: n.object({ buf: n.buffer(['..', 'b', 'len']) }),
				b: n.object({ len: n.uint8() })
			});
			await expect(
				schema.toBuffer({
					a: { buf: new Uint8Array([1, 2, 3, 4, 5]) },
					b: { len: 5 }
				})
			).rejects.toThrow(
				'NilError: Failed to resolve .b.len on { a, b } from element a, you can only reference keys defined before the current one.'
			);
		});
	});
});
