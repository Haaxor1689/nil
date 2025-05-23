import { expect, test, describe } from '@jest/globals';

import { n } from '../index';

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

		await expect(schema.toBuffer(42)).rejects.toThrow(
			`NilError: Failed to transform: ${msg}`
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
		await expect(schema.fromBuffer(buffer)).rejects.toThrow(
			`NilError: Failed to transform: ${msg}`
		);
	});
});

describe('resolvePath', () => {
	test('relative', async () => {
		const schema = n.object({
			a: n.uint8(),
			b: n.uint8().transform(
				(ctx, resolvePath) => {
					const resolved = resolvePath<{ a: number }>([]);
					return ctx.value + resolved.a;
				},
				(ctx, resolvePath) => {
					const resolved = resolvePath<{ a: number }>([]);
					return ctx.value - resolved.a;
				}
			)
		});

		const buffer = await schema.toBuffer({ a: 5, b: 10 });
		expect(buffer).toEqual(new Uint8Array([5, 5]));
		expect(await schema.fromBuffer(buffer)).toEqual({ a: 5, b: 10 });
	});

	test('absolute', async () => {
		const schema = n.object({
			a: n.uint8(),
			b: n.object({
				foo: n.uint8().transform(
					(ctx, resolvePath) => {
						const resolved = resolvePath<{ a: number }>(['~']);
						return ctx.value + resolved.a;
					},
					(ctx, resolvePath) => {
						const resolved = resolvePath<{ a: number }>(['~']);
						return ctx.value - resolved.a;
					}
				)
			})
		});

		const buffer = await schema.toBuffer({ a: 5, b: { foo: 10 } });
		expect(buffer).toEqual(new Uint8Array([5, 5]));
		expect(await schema.fromBuffer(buffer)).toEqual({ a: 5, b: { foo: 10 } });
	});
});

describe('fromBuffer', () => {
	test('with offset', async () => {
		const schema = n.int8();

		const buffer = new Uint8Array([0, 0, 0, 42]);
		expect(await schema.fromBuffer(buffer, 3)).toEqual(42);
	});
});
