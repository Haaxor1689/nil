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
});
