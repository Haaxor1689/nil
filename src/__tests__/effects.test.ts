import { expect, test, describe } from '@jest/globals';
import { NilError, n } from '../index';

describe('transform', () => {
	test('same type', async () => {
		const schema = n.string(5).transform(
			ctx => ctx.value.toUpperCase(),
			ctx => ctx.value.toLowerCase()
		);

		const buffer = await schema.toBuffer('HELLO');
		expect(buffer).toEqual(new Uint8Array([104, 101, 108, 108, 111]));
		expect(await schema.fromBuffer(buffer)).toEqual('HELLO');
	});

	test('change type', async () => {
		const schema = n.int32().transform(
			ctx => `${ctx.value} minutes`,
			ctx => Number(ctx.value.split(' ')[0])
		);

		const buffer = await schema.toBuffer('42 minutes');
		expect(buffer).toEqual(new Uint8Array([42, 0, 0, 0]));
		expect(await schema.fromBuffer(buffer)).toEqual('42 minutes');
	});

	test('toBuffer throws', async () => {
		const msg = `${Math.random()}`;
		const schema = n.int32().transform(
			ctx => ctx.value,
			() => {
				throw new Error(msg);
			}
		);

		await expect(schema.toBuffer(42)).rejects.toThrow(NilError);
		await expect(schema.toBuffer(42)).rejects.toThrow(
			`Failed to transform: ${msg}`
		);
	});

	test('fromBuffer throws', async () => {
		const msg = `${Math.random()}`;
		const schema = n.int32().transform(
			() => {
				throw new Error(msg);
			},
			ctx => ctx.value
		);

		const buffer = new Uint8Array([0, 0, 0, 42]);
		await expect(schema.fromBuffer(buffer)).rejects.toThrow(NilError);
		await expect(schema.fromBuffer(buffer)).rejects.toThrow(
			`Failed to transform: ${msg}`
		);
	});
});
