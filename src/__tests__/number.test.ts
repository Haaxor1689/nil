import { expect, test, describe } from '@jest/globals';

import { n } from '../index';

describe('number', () => {
	test('NaN and Infinity throws', async () => {
		const schema = n.uint8();
		await expect(schema.toBuffer(NaN)).rejects.toThrow(
			"NilError: Can't encode NaN as a number"
		);
		await expect(schema.toBuffer(Infinity)).rejects.toThrow(
			"NilError: Can't encode Infinity as a number"
		);
		await expect(schema.toBuffer(-Infinity)).rejects.toThrow(
			"NilError: Can't encode Infinity as a number"
		);
	});

	test('fromBuffer throws when buffer is too small', async () => {
		const schema = n.uint16();
		const smallBuffer = new Uint8Array([1]);
		await expect(schema.fromBuffer(smallBuffer)).rejects.toThrow(
			'NilError: Not enough space to decode 2-byte number, missing 1 byte(s)'
		);
	});

	test('encoding non-integer value throws', async () => {
		const schema = n.uint8();
		await expect(schema.toBuffer(1.5)).rejects.toThrow(
			"NilError: Can't encode non-integer value 1.5 as a number"
		);
	});

	describe('uint8', () => {
		test('default', async () => {
			const schema = n.uint8();
			const buffer = await schema.toBuffer(171);
			expect(buffer).toEqual(new Uint8Array([171]));
			expect(await schema.fromBuffer(buffer)).toEqual(171);
		});

		test('overflow throws', async () => {
			const schema = n.uint8();
			await expect(schema.toBuffer(256)).rejects.toThrow(
				'NilError: Value 256 is out of range for 8-bit unsigned integer'
			);
		});

		test('zero value', async () => {
			const schema = n.uint8();
			const buffer = await schema.toBuffer(0);
			expect(buffer).toEqual(new Uint8Array([0]));
			expect(await schema.fromBuffer(buffer)).toEqual(0);
		});

		test('maximum value', async () => {
			const schema = n.uint8();
			const buffer = await schema.toBuffer(255);
			expect(buffer).toEqual(new Uint8Array([255]));
			expect(await schema.fromBuffer(buffer)).toEqual(255);
		});

		test('negative value throws', async () => {
			const schema = n.uint8();
			await expect(schema.toBuffer(-1)).rejects.toThrow(
				'NilError: Value -1 is out of range for 8-bit unsigned integer'
			);
		});
	});

	describe('int8', () => {
		test('default', async () => {
			const schema = n.int8();
			const buffer = await schema.toBuffer(-1);
			expect(buffer).toEqual(new Uint8Array([255]));
			expect(await schema.fromBuffer(buffer)).toEqual(-1);
		});

		test('overflow throws', async () => {
			const schema = n.int8();
			await expect(schema.toBuffer(128)).rejects.toThrow(
				'NilError: Value 128 is out of range for 8-bit signed integer'
			);
		});

		test('zero value', async () => {
			const schema = n.int8();
			const buffer = await schema.toBuffer(0);
			expect(buffer).toEqual(new Uint8Array([0]));
			expect(await schema.fromBuffer(buffer)).toEqual(0);
		});

		test('minimum value', async () => {
			const schema = n.int8();
			const buffer = await schema.toBuffer(-128);
			expect(buffer).toEqual(new Uint8Array([128]));
			expect(await schema.fromBuffer(buffer)).toEqual(-128);
		});

		test('maximum value', async () => {
			const schema = n.int8();
			const buffer = await schema.toBuffer(127);
			expect(buffer).toEqual(new Uint8Array([127]));
			expect(await schema.fromBuffer(buffer)).toEqual(127);
		});
	});

	describe('uint16', () => {
		test('default', async () => {
			const schema = n.uint16();
			const buffer = await schema.toBuffer(43981);
			expect(buffer).toEqual(new Uint8Array([205, 171]));
			expect(await schema.fromBuffer(buffer)).toEqual(43981);
		});

		test('overflow throws', async () => {
			const schema = n.uint16();
			await expect(schema.toBuffer(65536)).rejects.toThrow(
				'NilError: Value 65536 is out of range for 16-bit unsigned integer'
			);
		});

		test('maximum value', async () => {
			const schema = n.uint16();
			const buffer = await schema.toBuffer(65535);
			expect(buffer).toEqual(new Uint8Array([255, 255]));
			expect(await schema.fromBuffer(buffer)).toEqual(65535);
		});

		test('negative value throws', async () => {
			const schema = n.uint16();
			await expect(schema.toBuffer(-1)).rejects.toThrow(
				'NilError: Value -1 is out of range for 16-bit unsigned integer'
			);
		});

		test('big endian', async () => {
			const schema = n.uint16().be();
			const buffer = await schema.toBuffer(43981);
			expect(buffer).toEqual(new Uint8Array([171, 205]));
			expect(await schema.fromBuffer(buffer)).toEqual(43981);
		});
	});

	describe('int16', () => {
		test('default', async () => {
			const schema = n.int16();
			const buffer = await schema.toBuffer(-1);
			expect(buffer).toEqual(new Uint8Array([255, 255]));
			expect(await schema.fromBuffer(buffer)).toEqual(-1);
		});

		test('overflow throws', async () => {
			const schema = n.int16();
			await expect(schema.toBuffer(32768)).rejects.toThrow(
				'NilError: Value 32768 is out of range for 16-bit signed integer'
			);
		});

		test('zero value', async () => {
			const schema = n.int16();
			const buffer = await schema.toBuffer(0);
			expect(buffer).toEqual(new Uint8Array([0, 0]));
			expect(await schema.fromBuffer(buffer)).toEqual(0);
		});

		test('maximum value', async () => {
			const schema = n.int16();
			const buffer = await schema.toBuffer(32767);
			expect(buffer).toEqual(new Uint8Array([255, 127]));
			expect(await schema.fromBuffer(buffer)).toEqual(32767);
		});

		test('big endian', async () => {
			const schema = n.int16().be();
			const buffer = await schema.toBuffer(12345);
			expect(buffer).toEqual(new Uint8Array([48, 57]));
			expect(await schema.fromBuffer(buffer)).toEqual(12345);
		});
	});

	describe('uint32', () => {
		test('default', async () => {
			const schema = n.uint32();
			const buffer = await schema.toBuffer(2882400001);
			expect(buffer).toEqual(new Uint8Array([1, 239, 205, 171]));
			expect(await schema.fromBuffer(buffer)).toEqual(2882400001);
		});

		test('overflow throws', async () => {
			const schema = n.uint32();
			await expect(schema.toBuffer(4294967296)).rejects.toThrow(
				'NilError: Value 4294967296 is out of range for 32-bit unsigned integer'
			);
		});

		test('maximum value', async () => {
			const schema = n.uint32();
			const buffer = await schema.toBuffer(4294967295);
			expect(buffer).toEqual(new Uint8Array([255, 255, 255, 255]));
			expect(await schema.fromBuffer(buffer)).toEqual(4294967295);
		});

		test('negative value throws', async () => {
			const schema = n.uint32();
			await expect(schema.toBuffer(-1)).rejects.toThrow(
				'NilError: Value -1 is out of range for 32-bit unsigned integer'
			);
		});

		test('big endian', async () => {
			const schema = n.uint32().be();
			const buffer = await schema.toBuffer(2882400001);
			expect(buffer).toEqual(new Uint8Array([171, 205, 239, 1]));
			expect(await schema.fromBuffer(buffer)).toEqual(2882400001);
		});
	});

	describe('int32', () => {
		test('default', async () => {
			const schema = n.int32();
			const buffer = await schema.toBuffer(-1);
			expect(buffer).toEqual(new Uint8Array([255, 255, 255, 255]));
			expect(await schema.fromBuffer(buffer)).toEqual(-1);
		});

		test('overflow throws', async () => {
			const schema = n.int32();
			await expect(schema.toBuffer(2147483648)).rejects.toThrow(
				'NilError: Value 2147483648 is out of range for 32-bit signed integer'
			);
		});

		test('zero value', async () => {
			const schema = n.int32();
			const buffer = await schema.toBuffer(0);
			expect(buffer).toEqual(new Uint8Array([0, 0, 0, 0]));
			expect(await schema.fromBuffer(buffer)).toEqual(0);
		});

		test('maximum value', async () => {
			const schema = n.int32();
			const buffer = await schema.toBuffer(2147483647);
			expect(buffer).toEqual(new Uint8Array([255, 255, 255, 127]));
			expect(await schema.fromBuffer(buffer)).toEqual(2147483647);
		});

		test('big endian', async () => {
			const schema = n.int32().be();
			const buffer = await schema.toBuffer(123456789);
			expect(buffer).toEqual(new Uint8Array([7, 91, 205, 21]));
			expect(await schema.fromBuffer(buffer)).toEqual(123456789);
		});
	});

	describe('float', () => {
		test('default', async () => {
			const schema = n.float();
			const buffer = await schema.toBuffer(1.23);
			expect(buffer).toEqual(new Uint8Array(new Float32Array([1.23]).buffer));
			const result = await schema.fromBuffer(buffer);
			expect(Math.abs(result - 1.23)).toBeLessThan(1e-6);
		});

		test('overflow throws', async () => {
			const schema = n.float();
			await expect(schema.toBuffer(Number.MAX_VALUE)).rejects.toThrow(
				'NilError: Value 1.7976931348623157e+308 is out of range for 32-bit floating point number'
			);
		});

		test('negative zero', async () => {
			const schema = n.float();
			const buffer = await schema.toBuffer(-0);
			expect(buffer).toEqual(new Uint8Array(new Float32Array([-0]).buffer));
			const result = await schema.fromBuffer(buffer);
			expect(Object.is(result, -0)).toBe(true);
		});

		test('subnormal value', async () => {
			const schema = n.float();
			const buffer = await schema.toBuffer(1.4e-45);
			expect(buffer).toEqual(
				new Uint8Array(new Float32Array([1.4e-45]).buffer)
			);
			const result = await schema.fromBuffer(buffer);
			expect(result).toBeCloseTo(1.4e-45, 7);
		});

		test('big endian', async () => {
			const schema = n.float().be();
			const buffer = await schema.toBuffer(1.23);
			expect(buffer).toEqual(
				new Uint8Array(new Float32Array([1.23]).buffer).reverse()
			);
			const result = await schema.fromBuffer(buffer);
			expect(Math.abs(result - 1.23)).toBeLessThan(1e-6);
		});
	});

	describe('double', () => {
		test('default', async () => {
			const schema = n.double();
			const buffer = await schema.toBuffer(1.23);
			expect(buffer).toEqual(new Uint8Array(new Float64Array([1.23]).buffer));
			const result = await schema.fromBuffer(buffer);
			expect(Math.abs(result - 1.23)).toBeLessThan(Number.EPSILON);
		});

		test('negative zero', async () => {
			const schema = n.double();
			const buffer = await schema.toBuffer(-0);
			expect(buffer).toEqual(new Uint8Array(new Float64Array([-0]).buffer));
			const result = await schema.fromBuffer(buffer);
			expect(Object.is(result, -0)).toBe(true);
		});

		test('subnormal value', async () => {
			const schema = n.double();
			const buffer = await schema.toBuffer(5e-324);
			expect(buffer).toEqual(new Uint8Array(new Float64Array([5e-324]).buffer));
			const result = await schema.fromBuffer(buffer);
			expect(result).toBeCloseTo(5e-324, 15);
		});

		test('boundary value just below max', async () => {
			const schema = n.double();
			const buffer = await schema.toBuffer(1.7976931348623157e308 - 1e292);
			expect(buffer).toEqual(
				new Uint8Array(
					new Float64Array([1.7976931348623157e308 - 1e292]).buffer
				)
			);
			const result = await schema.fromBuffer(buffer);
			expect(result).toBeCloseTo(1.7976931348623157e308 - 1e292, 15);
		});

		test('boundary value just above min', async () => {
			const schema = n.double();
			const buffer = await schema.toBuffer(-1.7976931348623157e308 + 1e292);
			expect(buffer).toEqual(
				new Uint8Array(
					new Float64Array([-1.7976931348623157e308 + 1e292]).buffer
				)
			);
			const result = await schema.fromBuffer(buffer);
			expect(result).toBeCloseTo(-1.7976931348623157e308 + 1e292, 15);
		});

		test('big endian', async () => {
			const schema = n.double().be();
			const buffer = await schema.toBuffer(1.23);
			expect(buffer).toEqual(
				new Uint8Array(new Float64Array([1.23]).buffer).reverse()
			);
			const result = await schema.fromBuffer(buffer);
			expect(Math.abs(result - 1.23)).toBeLessThan(Number.EPSILON);
		});
	});
});
