import { expect, test, describe } from '@jest/globals';
import { n } from '../index';

describe('undefined', () => {
	test('default', async () => {
		const schema = n.undefined();
		const buffer = await schema.toBuffer(undefined);
		expect(buffer).toEqual(new Uint8Array([]));
		expect(await schema.fromBuffer(buffer)).toBeUndefined();
	});
});
