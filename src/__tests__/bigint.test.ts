import { expect, test } from '@jest/globals';

import { n } from '../index';

describe('bigint', () => {
	test('fromBuffer throws when buffer is too small', async () => {
		const schema = n.int64();
		const smallBuffer = new Uint8Array([1]);
		await expect(schema.fromBuffer(smallBuffer)).rejects.toThrow(
			'NilError: Not enough space to decode 8-byte number, missing 7 byte(s)'
		);
	});

	describe('int64', () => {
		test('default', async () => {
			const schema = n.int64();
			const buffer = await schema.toBuffer(BigInt(-1));
			expect(buffer).toEqual(
				new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255])
			);
			expect(await schema.fromBuffer(buffer)).toEqual(BigInt(-1));
		});

		test('overflow throws', async () => {
			const schema = n.int64();
			await expect(
				schema.toBuffer(BigInt('9223372036854775808'))
			).rejects.toThrow(
				'NilError: Value 9223372036854775808 is out of range for 64-bit signed'
			);
		});

		test('zero value', async () => {
			const schema = n.int64();
			const buffer = await schema.toBuffer(BigInt(0));
			expect(buffer).toEqual(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]));
			expect(await schema.fromBuffer(buffer)).toEqual(BigInt(0));
		});

		test('maximum value', async () => {
			const schema = n.int64();
			const buffer = await schema.toBuffer(BigInt('9223372036854775807'));
			expect(buffer).toEqual(
				new Uint8Array([255, 255, 255, 255, 255, 255, 255, 127])
			);
			expect(await schema.fromBuffer(buffer)).toEqual(
				BigInt('9223372036854775807')
			);
		});

		test('maximum value big endian', async () => {
			const schema = n.int64().be();
			const buffer = await schema.toBuffer(BigInt('9223372036854775807'));
			expect(buffer).toEqual(
				new Uint8Array([127, 255, 255, 255, 255, 255, 255, 255])
			);
			expect(await schema.fromBuffer(buffer)).toEqual(
				BigInt('9223372036854775807')
			);
		});
	});

	describe('uint64', () => {
		test('default', async () => {
			const schema = n.uint64();
			const buffer = await schema.toBuffer(BigInt('18446744073709551615'));
			expect(buffer).toEqual(
				new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255])
			);
			expect(await schema.fromBuffer(buffer)).toEqual(
				BigInt('18446744073709551615')
			);
		});

		test('negative value throws', async () => {
			const schema = n.uint64();
			await expect(schema.toBuffer(BigInt('-1'))).rejects.toThrow(
				'NilError: Value -1 is out of range for 64-bit unsigned integer'
			);
		});

		test('zero value', async () => {
			const schema = n.uint64();
			const buffer = await schema.toBuffer(BigInt(0));
			expect(buffer).toEqual(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]));
			expect(await schema.fromBuffer(buffer)).toEqual(BigInt(0));
		});

		test('maximum value', async () => {
			const schema = n.uint64();
			const buffer = await schema.toBuffer(BigInt('18446744073709551615'));
			expect(buffer).toEqual(
				new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255])
			);
			expect(await schema.fromBuffer(buffer)).toEqual(
				BigInt('18446744073709551615')
			);
		});
	});
});
