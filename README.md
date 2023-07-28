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
const buffer = mySchema.toBuffer('Hello world!!!');

// Prase from Uint8Array
const parsed = mySchema.fromBuffer(buffer);
```

Creating an object schema

```ts
const User = n.object({
	username: n.string(4),
	age: n.int8(),
	active: n.bool()
});

// Extract the output type
type User = n.output<typeof User>;
// { username: string; age: number; active: boolean; }

const buffer = User.toBuffer({ username: 'Jane', age: 30, active: true });

// Prase from Uint8Array
User.fromBuffer(buffer);
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

Since we are dealing with binary data, there are no optional properties and **order of the attributes matters**. All values are read in order they were declared in.

```ts
import { n } from '@haaxor1689/nil';

// Declare object schema with given shape
const User = n.object({
	age: n.uint16(),
	active: n.int32()
});

// Extract the output type
type User = n.output<typeof User>;

// Equivalent to
type User = {
	age: number;
	active: boolean;
};
```

Above object schema would be equivalent to this this **C** struct definition:

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
			color: n.array(n.uint8(), ['..', '..', 'channels'])
		}),
		['itemCount']
	)
});
```

## Schema methods

All Nil schemas contain these methods.

### `.transform`

```ts
.transform(
  afterDecode: (v: Input, ctx?: ParseContext) => Output,
  beforeEncode: (v: Output, ctx?: ParseContext) => Input
)
```

You can provide custom transformation functions for your schemas that will change the output both when parsing from raw buffer and creating a buffer from JS object.

```ts
// Define transform that handles calculating `itemCount`
const MySchema = n
	.object({
		itemCount: n.int16(),
		items: n.array(n.int8(), ['itemCount'])
	})
	.transform(
		v => v.items, // Keep only raw items
		v => ({ itemCount: v.length, items: v }) // Calculate itemCount
	);

// Inferred output type is `number[]`
type MySchema = z.output<typeof MySchema>;

// Resulting buffer will start with correct `itemCount` number
MySchema.toBuffer([1, 2, 3, 4]);
```

### `.fromBuffer`

`.fromBuffer(data: Uint8Array): Output`

Tries to parse given buffer into output type of used schema. Throws errors on failure.

### `.toBuffer`

`.toBuffer(value: Output): Uint8Array`

Tries to serialize given object into a buffer.

## TODO

- Literal types
- Enums
- Unions
- Better error handling
- Dynamic length null terminated strings
- Dynamic length array-like schemas
- Don't allow smaller arrays then their defined constant size
- Tests
