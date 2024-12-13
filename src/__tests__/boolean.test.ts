import { expect, test } from '@jest/globals';

import { n } from '../index';

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
		await expect(schema.fromBuffer(buffer)).rejects.toThrow(
			'NilError: Invalid value 2 for a boolean'
		);
	});

	test('fromBuffer throws when buffer is too small', async () => {
		const schema = n.bool();
		const smallBuffer = new Uint8Array([]);
		await expect(schema.fromBuffer(smallBuffer)).rejects.toThrow(
			'NilError: Not enough space to decode boolean, missing 1 byte(s)'
		);
	});
});
