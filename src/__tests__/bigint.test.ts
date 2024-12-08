import { expect, test } from '@jest/globals';
import { NilError, n } from '../index';

describe('bigint', () => {
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
			).rejects.toThrow(NilError);
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
			await expect(schema.toBuffer(BigInt('-1'))).rejects.toThrow(NilError);
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
