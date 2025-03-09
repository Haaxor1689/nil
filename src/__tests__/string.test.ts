import { expect, test, describe } from '@jest/globals';

import { n } from '../index';

describe('string', () => {
	describe('set length', () => {
		test('default', async () => {
			const schema = n.string(5);
			const buffer = await schema.toBuffer('hello');
			expect(buffer).toEqual(new Uint8Array([104, 101, 108, 108, 111]));
			expect(await schema.fromBuffer(buffer)).toEqual('hello');
		});

		test('empty', async () => {
			const schema = n.string(0);
			const buffer = await schema.toBuffer('');
			expect(buffer).toEqual(new Uint8Array([]));
			expect(await schema.fromBuffer(buffer)).toEqual('');
		});

		test('too short', async () => {
			const schema = n.string(10);
			await expect(schema.toBuffer('hello')).rejects.toThrow(
				'NilError: String "hello" wrong length to encode into 10 bits'
			);
		});

		test('too long', async () => {
			const schema = n.string(5);
			await expect(schema.toBuffer('hello world')).rejects.toThrow(
				'NilError: String "hello world" wrong length to encode into 5 bits'
			);
		});

		test('fromBuffer throws when buffer is too small', async () => {
			const schema = n.string(5);
			const smallBuffer = new Uint8Array([104, 101, 108]);
			await expect(schema.fromBuffer(smallBuffer)).rejects.toThrow(
				'NilError: Not enough space to decode 5-byte string, missing 2 byte(s)'
			);
		});
	});

	describe('byte length', () => {
		test('default', async () => {
			const schema = n.string(40).bytes();
			const buffer = await schema.toBuffer('hello');
			expect(buffer).toEqual(new Uint8Array([104, 101, 108, 108, 111]));
			expect(await schema.fromBuffer(buffer)).toEqual('hello');
		});

		test('empty', async () => {
			const schema = n.string(0).bytes();
			const buffer = await schema.toBuffer('');
			expect(buffer).toEqual(new Uint8Array([]));
			expect(await schema.fromBuffer(buffer)).toEqual('');
		});

		test('too short', async () => {
			const schema = n.string(80).bytes();
			await expect(schema.toBuffer('hello')).rejects.toThrow(
				'NilError: String "hello" wrong length to encode into 10 bits'
			);
		});

		test('too long', async () => {
			const schema = n.string(40).bytes();
			await expect(schema.toBuffer('hello world')).rejects.toThrow(
				'NilError: String "hello world" wrong length to encode into 5 bits'
			);
		});

		test('wrong length', async () => {
			const cb = () => n.string(3).bytes();
			expect(cb).toThrow(Error);
			expect(cb).toThrow('Byte size 3 is not divisible by 8.');
		});

		test('throws based on length type', async () => {
			expect(() => n.string('fill').bytes()).toThrow(
				"Can't set bytes on dynamic length string."
			);
			expect(() => n.string('null-terminated').bytes()).toThrow(
				"Can't set bytes on dynamic length string."
			);
			expect(() => n.string(80).bytes()).not.toThrow();
			expect(() => n.string(['foo']).bytes()).not.toThrow();
		});
	});

	describe('fill length', () => {
		test('default', async () => {
			const schema = n.string('fill');
			const buffer = await schema.toBuffer('hello');
			expect(buffer).toEqual(new Uint8Array([104, 101, 108, 108, 111]));
			expect(await schema.fromBuffer(buffer)).toEqual('hello');
		});

		test('empty', async () => {
			const schema = n.string('fill');
			const buffer = await schema.toBuffer('');
			expect(buffer).toEqual(new Uint8Array([]));
			expect(await schema.fromBuffer(buffer)).toEqual('');
		});

		test('with null character', async () => {
			const schema = n.string('fill');
			const buffer = await schema.toBuffer('hello\0world\0');
			expect(buffer).toEqual(
				new Uint8Array([104, 101, 108, 108, 111, 0, 119, 111, 114, 108, 100, 0])
			);
			expect(await schema.fromBuffer(buffer)).toEqual('hello\0world\0');
		});
	});

	describe('null-terminated length', () => {
		test('default', async () => {
			const schema = n.string('null-terminated');
			const buffer = await schema.toBuffer('hello');
			expect(buffer).toEqual(new Uint8Array([104, 101, 108, 108, 111, 0]));
			expect(await schema.fromBuffer(buffer)).toEqual('hello');
		});

		test('empty', async () => {
			const schema = n.string('null-terminated');
			const buffer = await schema.toBuffer('');
			expect(buffer).toEqual(new Uint8Array([0]));
			expect(await schema.fromBuffer(buffer)).toEqual('');
		});

		test('with null character', async () => {
			const schema = n.string('null-terminated');
			const buffer = await schema.toBuffer('hello\0world');
			expect(buffer).toEqual(new Uint8Array([104, 101, 108, 108, 111, 0]));
			expect(await schema.fromBuffer(buffer)).toEqual('hello');
		});

		test('with extra data after null', async () => {
			const schema = n.string('null-terminated');
			const buffer = new Uint8Array([104, 101, 108, 108, 111, 0, 119, 111]);
			expect(await schema.fromBuffer(buffer)).toEqual('hello');
		});
	});

	describe('path length', () => {
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
				b: n.object({ str: n.string(['^', 'a', 'len']) })
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
	});

	describe('unicode', () => {
		test('default', async () => {
			const schema = n.string(6);
			const buffer = await schema.toBuffer('你好');
			expect(buffer).toEqual(new Uint8Array([228, 189, 160, 229, 165, 189]));
			expect(await schema.fromBuffer(buffer)).toEqual('你好');
		});

		test('too short', async () => {
			const schema = n.string(2);
			await expect(schema.toBuffer('你好')).rejects.toThrow(
				'NilError: String "你好" wrong length to encode into 2 bits'
			);
		});
	});
});
