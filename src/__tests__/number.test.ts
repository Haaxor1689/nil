import { expect, test } from '@jest/globals';

import { n } from '../index';

test('encodes', async () => {
	expect(await n.uint8().fromBuffer(new Uint8Array([0xab]))).toEqual(0xab);

	expect(await n.uint8().fromBuffer(new Uint8Array([0xff]))).toEqual(255);
	expect(await n.int8().fromBuffer(new Uint8Array([0xff]))).toEqual(-1);
});
