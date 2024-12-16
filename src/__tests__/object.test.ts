import { expect, test, describe } from '@jest/globals';

import { n } from '../index';

describe('object', () => {
	test('default', async () => {
		const schema = n.object({
			a: n.uint8(),
			b: n.int16(),
			c: n.bool()
		});
		const buffer = await schema.toBuffer({ a: 1, b: -2, c: true });
		expect(buffer).toEqual(new Uint8Array([1, 254, 255, 1]));
		expect(await schema.fromBuffer(buffer)).toEqual({ a: 1, b: -2, c: true });
	});

	test('nested objects', async () => {
		const schema = n.object({
			a: n.uint8(),
			o: n.object({
				b: n.int16(),
				c: n.bool()
			})
		});
		const buffer = await schema.toBuffer({ a: 1, o: { b: -2, c: true } });
		expect(buffer).toEqual(new Uint8Array([1, 254, 255, 1]));
		expect(await schema.fromBuffer(buffer)).toEqual({
			a: 1,
			o: { b: -2, c: true }
		});
	});

	test('missing properties', async () => {
		const schema = n.object({
			a: n.uint8(),
			undef: n.undefined(),
			b: n.int16(),
			c: n.float()
		});
		const buffer = new Uint8Array([1, 255, 254]);
		await expect(schema.toBuffer({ a: 1, b: -2 } as never)).rejects.toThrow(
			'NilError: Missing value for field c'
		);
		await expect(schema.fromBuffer(buffer)).rejects.toThrow(
			'NilError: Not enough space to decode object key c, missing 4 byte(s)'
		);
	});

	test('extra properties', async () => {
		const schema = n.object({
			a: n.uint8(),
			b: n.int16()
		});
		const buffer = await schema.toBuffer({ a: 1, b: -2, c: 3.14 } as never);
		expect(buffer).toEqual(new Uint8Array([1, 254, 255]));
		expect(await schema.fromBuffer(buffer)).toEqual({ a: 1, b: -2 });
	});

	test('with fill element not last', async () => {
		const schema = n.object({
			a: n.string('fill'),
			b: n.string('fill')
		});
		const buffer = await schema.toBuffer({ a: 'hello', b: 'world' });
		expect(buffer).toEqual(
			new Uint8Array([104, 101, 108, 108, 111, 119, 111, 114, 108, 100])
		);
		expect(await schema.fromBuffer(buffer)).toEqual({ a: 'helloworld', b: '' });
	});

	describe('path resolve', () => {
		test('default', async () => {
			const schema = n.object({
				a: n.uint8(),
				b: n.string(['a'])
			});
			const buffer = await schema.toBuffer({ a: 5, b: 'hello' });
			expect(buffer).toEqual(new Uint8Array([5, 104, 101, 108, 108, 111]));
			expect(await schema.fromBuffer(buffer)).toEqual({ a: 5, b: 'hello' });
		});

		test('nested', async () => {
			const schema = n.object({
				a: n.object({ len: n.uint8() }),
				b: n.object({ str: n.string(['..', 'a', 'len']) })
			});
			const buffer = await schema.toBuffer({
				a: { len: 5 },
				b: { str: 'hello' }
			});
			expect(buffer).toEqual(new Uint8Array([5, 104, 101, 108, 108, 111]));
			expect(await schema.fromBuffer(buffer)).toEqual({
				a: { len: 5 },
				b: { str: 'hello' }
			});
		});

		test('invalid', async () => {
			const schema = n.object({
				a: n.bool(),
				b: n.string(['a'])
			});
			await expect(schema.toBuffer({ a: false, b: 'hello' })).rejects.toThrow(
				'NilError: Invalid length false resolved from .a'
			);
			await expect(
				schema.fromBuffer(new Uint8Array([0, 104, 101, 108, 108, 111]))
			).rejects.toThrow('NilError: Invalid length false resolved from .a');
		});

		test('invalid parent', async () => {
			const schema = n.object({
				a: n.uint8(),
				b: n.string(['..'])
			});
			await expect(schema.toBuffer({ a: 5, b: 'hello' })).rejects.toThrow(
				'NilError: Failed to resolve .^, no parent found'
			);
		});

		test('invalid path', async () => {
			const schema = n.object({
				a: n.uint8(),
				b: n.string(['c'])
			});
			await expect(schema.toBuffer({ a: 5, b: 'hello' })).rejects.toThrow(
				'NilError: Failed to resolve .c on { a, b }, key not found'
			);
		});

		test('invalid number path', async () => {
			const schema = n.object({
				a: n.uint8(),
				b: n.string([0])
			});
			await expect(schema.toBuffer({ a: 5, b: 'hello' })).rejects.toThrow(
				'NilError: Invalid key 0 in path [0], key of an object must be a string'
			);
		});

		test('string in object', async () => {
			const schema = n.object({
				a: n.string(4),
				b: n.uint8()
			});
			const buffer = await schema.toBuffer({ a: 'test', b: 1 });
			expect(buffer).toEqual(new Uint8Array([116, 101, 115, 116, 1]));
			expect(await schema.fromBuffer(buffer)).toEqual({ a: 'test', b: 1 });
		});

		test('wrong order', async () => {
			const schema = n.object({
				a: n.string(['b']),
				b: n.uint8()
			});
			await expect(schema.toBuffer({ a: 'hello', b: 5 })).rejects.toThrow(
				'NilError: Failed to resolve .b on { a, b } from element a, you can only reference keys defined before the current one.'
			);
		});

		test('wrong order nested', async () => {
			const schema = n.object({
				a: n.object({ str: n.string(['..', 'b', 'len']) }),
				b: n.object({ len: n.uint8() })
			});
			await expect(
				schema.toBuffer({ a: { str: 'hello' }, b: { len: 5 } })
			).rejects.toThrow(
				'NilError: Failed to resolve .b.len on { a, b } from element a, you can only reference keys defined before the current one.'
			);
		});
	});
});
