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
});
