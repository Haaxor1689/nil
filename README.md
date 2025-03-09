# Nil

TypeScript-first binary data parsing library with static type inference. Heavily inspired by [Zod](https://github.com/colinhacks/zod) and [Restructure](https://github.com/foliojs/restructure).

## Installation

```
npm install @haaxor1689/nil
```

## Basic usage

Creating a simple string schema

```ts
import { n } from '@haaxor1689/nil';

// Create schema for string with length of 14 characters
const mySchema = n.string(14);

// Parse into Uint8Array
const buffer = await mySchema.toBuffer('Hello world!!!');

// Prase from Uint8Array
const parsed = await mySchema.fromBuffer(buffer);
```

Creating an object schema

```ts
import { n } from '@haaxor1689/nil';

const User = n.object({
	username: n.string(4),
	age: n.int8(),
	active: n.bool()
});

// Extract the output type
type User = n.output<typeof User>;
// { username: string; age: number; active: boolean; }

const buffer = await User.toBuffer({ username: 'Jane', age: 30, active: true });

// Parse from Uint8Array
await User.fromBuffer(buffer);
```

## Primitives

```ts
import { n } from '@haaxor1689/nil';

// boolean
n.bool();

// number
n.int8();
n.uint8();
n.int16();
n.uint16();
n.int32();
n.uint32();
n.float();
n.double();

// bigint
n.int64();
n.uint64();
```

### Endianness

By default, all numbers are assumed to be in little-endian byte order. You can change this by using the `.be()` option:

```ts
import { n } from '@haaxor1689/nil';

// Will be read in big-endian byte order
n.int32().be();
```

> `.be()` is not available for `bool` and is silently ignored for `int8` and `uint8` schemas.

## Objects

Since we are dealing with binary data, there are no optional properties, and the **order of the attributes matters**. All values are read in the order they were declared in.

```ts
import { n } from '@haaxor1689/nil';

// Declare object schema with given shape
const User = n.object({
	rank: n.uint16(),
	active: n.bool()
});

// Extract the output type
type User = n.output<typeof User>;

// Equivalent to
type User = {
	rank: number;
	active: boolean;
};
```

The above object schema would be equivalent to this **C** struct definition:

```c
struct User {
  unsigned short age;
  bool active;
}
```

## Array-like types

All array-like types must have a known size. It can either be provided as a constant, or by referencing value from surrounding context.

```ts
import { n } from '@haaxor1689/nil';

// Constant size
n.buffer(10); // Uint8Array
n.string(10); // string
n.array(n.int16(), 10); // number[]

// Size defined from context
n.object({
	itemCount: n.int16(),
	items: n.array(n.int16(), ['itemCount'])
});

// Nested context
n.object({
	channels: n.int8(),
	itemCount: n.int16(),
	items: n.array(
		n.object({
			color: n.array(n.uint8(), ['^', '^', 'channels'])
		}),
		['itemCount']
	)
});

// Set size to fill source
n.buffer('fill');
n.array(n.int16(), 'fill');
```

> Note that any dynamically sized array-like type will **fill** the whole remaining space in the buffer so they **should always be at the end**.

### Null terminated strings

For strings specifically, you can choose the `'null-terminated'` length option to make them behave like c-strings.

```ts
const buffer = new Uint8Array([
	104, 101, 108, 108, 111, 0, 119, 111, 114, 108, 100, 0
]);

n.string('fill').fromBuffer(buffer); // -> "hello\0world\0"
n.string('null-terminated').fromBuffer(buffer); // -> "hello"

n.string('null-terminated').toBuffer('hello\0world\0'); // Strips everything after first \0
```

### Length in bytes

The `.bytes()` option can be used to interpret a given length in bytes instead of the count of elements.

```ts
import { n } from '@haaxor1689/nil';

// Size will be 256 bytes
n.buffer(256).bytes();
n.string(256).bytes();
n.array(n.int8(), 256).bytes();
```

> Trying to use `.bytes()` with `fill` or `null-terminated` length is not supported and will throw an error.

## Enums

You can load **C** enum values as a string literal union. Only default numbered **C** enums are supported now.

```ts
import { n } from '@haaxor1689/nil';

// Declare enum schema with given options
const Level = n.enum(n.uint8(), ['LOW', 'MEDIUM', 'HIGH']);

// Extract the output type
type Level = n.output<typeof Level>;

// Equivalent to
type Level = 'LOW' | 'MEDIUM' | 'HIGH';
```

The above enum schema would be equivalent to this **C** enum definition:

```c
enum Level {
  LOW,
  MEDIUM,
  HIGH
}
```

### `.options`

You can access the tuple used to create a given enum with `.options`.

```ts
import { n } from '@haaxor1689/nil';

// Declare enum schema with given options
const Level = n.enum(n.uint8(), ['LOW', 'MEDIUM', 'HIGH']);

Level.options; // ["LOW", "MEDIUM", "HIGH"]
```

## Undefined

If you need a placeholder that represents 0 bytes in the binary data, you can use the undefined type for that:

```ts
import { n } from '@haaxor1689/nil';

// Declare object schema with given shape
const User = n.object({
	empty: n.undefined(), // represents 0 bytes in buffer
	active: n.int32()
});

// Extract the output type
type User = n.output<typeof User>;

// Equivalent to
type User = {
	empty: undefined;
	active: boolean;
};
```

## Schema methods

All Nil schemas contain these methods.

### `.transform`

```ts
.transform(
  afterDecode: (ctx: TransformContext<Input>, resolvePath: <T = unknown>(path: ParsePath) => T) => Promise<Output> | Output,
  beforeEncode: (ctx: TransformContext<Output>, resolvePath: <T = unknown>(path: ParsePath) => T) => Promise<Input> | Input
)
```

You can provide custom transformation functions for your schemas that will change the output both when parsing from the raw buffer and creating a buffer from the JS object.

```ts
import { n } from '@haaxor1689/nil';

// Define transform that handles calculating `itemCount`
const MySchema = n
	.object({
		itemCount: n.int16(),
		items: n.array(n.int8(), ['itemCount'])
	})
	.transform(
		ctx => ctx.value.items, // keep only raw items
		ctx => ({ itemCount: ctx.value.length, items: ctx.value }) // calculate itemCount
	);

// Inferred output type is `number[]`
type MySchema = n.output<typeof MySchema>;

// Resulting buffer will start with correct `itemCount` number
await MySchema.toBuffer([1, 2, 3, 4]);
```

You can also access the current context when creating transformations to reference other attributes from the parent type (if any). The easiest way to do this is by using the `resolvePath` helper function that's provided as the second argument to transform functions:

```ts
import { n } from '@haaxor1689/nil';

const MySchema = n.object({
	hasAlpha: n.bool(),
	data: n.array(n.int8(), 'fill').transform(
		(ctx, resolvePath) => {
			const hasAlpha = resolvePath<boolean>(['hasAlpha']); // will hold value of `hasAlpha` attribute from parent object
			return ctx.value;
		},
		(ctx, resolvePath) => {
			const hasAlpha = resolvePath<boolean>(['hasAlpha']); // will hold value of `hasAlpha` attribute from parent object
			return ctx.value;
		}
	)
});
```

Below are more examples of how `resolvePath` can be used:

```ts
import { n } from '@haaxor1689/nil';

const MySchema = n.object({
	id: n.uint16(),
	data: n.object({
		frames: n.array(n.int8(), 20)
		data: n.array(n.int8(), 20).transform(
			(ctx, resolvePath) => {
				resolvePath<{ frames: number[] }>([]); // Resolving starts from the immediate parent element
				resolvePath<{ id: number }>(['^']); // Use "^" to resolve further up the tree
				resolvePath<{ id: number }>(['~']); // Use "~" to start resolving from the root
				resolvePath<number[]>(['frames']); // Use string to resolve object keys
				resolvePath<number>(['frames', 0]); // Use number to resolve array entries

				// Throws NilError!
				resolvePath(['^', 'flags']); // You can only resolve paths that were already decoded

				return ctx.value;
			},
			(ctx, resolvePath) => ctx.value
		)
	}),
	flags: n.uint16()
});
```

### `.fromBuffer`

```ts
.fromBuffer(data: Uint8Array, offset?: number): Promise<Output>
```

Tries to parse given buffer into output type of used schema. Throws `NilError` on failure. You can also pass an initial offset to start decoding from.

### `.toBuffer`

```ts
.toBuffer(value: Output): Promise<Uint8Array>
```

Tries to serialize a given object into a buffer. Throws `NilError` on failure.

## Error Handling

Nil provides a custom `NilError` class that includes context information when parsing fails:

```ts
import { n } from '@haaxor1689/nil';

try {
	await MySchema.fromBuffer(invalidBuffer);
} catch (error) {
	if (error instanceof n.NilError) {
		console.error(
			`Error at path ${n.formatPath(error.ctx.path)}: ${error.message}`
		);
	}
}
```

## Type Utilities

Nil provides several type utilities:

```ts
import { n } from '@haaxor1689/nil';

// Get the TypeScript type for the output of a schema
type Output = n.output<typeof mySchema>;

// Get the TypeScript type for the input of a schema
type Input = n.input<typeof mySchema>;
```

## TODO

- Literal types
- Unions
