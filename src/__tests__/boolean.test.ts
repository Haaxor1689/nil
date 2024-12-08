import { expect, test } from '@jest/globals';
import { NilError, n } from '../index';

describe('boolean', () => {
	test('true', async () => {
		const schema = n.bool();
		const buffer = await schema.toBuffer(true);
		expect(buffer).toEqual(new Uint8Array([1]));
		expect(await schema.fromBuffer(buffer)).toEqual(true);
	});

	test('false', async () => {
		const schema = n.bool();
		const buffer = await schema.toBuffer(false);
		expect(buffer).toEqual(new Uint8Array([0]));
		expect(await schema.fromBuffer(buffer)).toEqual(false);
	});

	test('invalid', async () => {
		const schema = n.bool();
		const buffer = new Uint8Array([2]);
		await expect(schema.fromBuffer(buffer)).rejects.toThrow(NilError);
	});
});
