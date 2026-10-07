# safe-to-json

**Safe JSON stringify for logging and error reporting.** `toSafeJson` turns any value — including caught `Error` objects, circular references and huge request/response objects — into plain, always-serializable JSON. It serializes errors with `name`, `message`, `stack` and `cause` chains, limits depth, truncates long strings and large arrays, and never throws. Zero dependencies, TypeScript, ESM, and runs in Cloudflare Workers (workerd), edge runtimes, browsers and Node.js.

## Why

Plain `JSON.stringify` breaks in three ways when you log arbitrary values or send them to telemetry:

1. **It throws on circular references**, so your logging code crashes while handling an error.
2. **It serializes everything**: an error holding a request or response pulls in every header and token, which leaks sensitive data and bloats your logs.
3. **It drops error details**: `name`, `message`, `stack` and `cause` are non-enumerable, so `JSON.stringify(new Error("x"))` gives `"{}"`.

`toSafeJson` adds a circular-reference guard and caps on depth, string length and item count. For errors it reads the non-enumerable fields explicitly. The result is always plain JSON you can pass straight to `JSON.stringify`.

## Install

```sh
npm install safe-to-json
```

## Usage

```ts
import { toSafeJson } from "safe-to-json";

toSafeJson(anyValue); // default limits
toSafeJson(anyValue, { maxDepth: 3, maxStr: 1000, maxItems: 20 });
```

### Log a caught error

```ts
try {
  await db.query("select 1");
} catch (e) {
  // name, message, stack, custom fields (code, status, ...) and the whole cause chain
  console.error(JSON.stringify({ msg: "query failed", err: toSafeJson(e) }));
}
```

### Send an error to telemetry from a Cloudflare Worker

```ts
export default {
  async fetch(req, env, ctx) {
    try {
      return await handle(req, env);
    } catch (e) {
      ctx.waitUntil(
        fetch(env.LOG_URL, { method: "POST", body: JSON.stringify(toSafeJson(e)) }),
      );
      return new Response("Internal Error", { status: 500 });
    }
  },
};
```

### Circular references

```ts
const a: Record<string, unknown> = { n: 1 };
a.self = a;
toSafeJson(a); // { n: 1, self: "[unserializable]" }
```

Other common uses: debug-logging state objects or user input of unknown size, and returning error details in an API response body.

## API

### `toSafeJson(value: unknown, options?: SafeJsonOptions): unknown`

Returns a JSON-safe copy of `value`. Call `JSON.stringify` on the result if you need a string.

| Option | Default | Meaning |
| --- | --- | --- |
| `maxDepth` | `5` | Maximum nesting depth, including `cause` chains |
| `maxStr` | `4000` | Maximum string length; longer strings end with `…(truncated)` |
| `maxItems` | `50` | Maximum number of array items or object keys |

### Rules

- **Primitives** (`number`, `boolean`, `null`, `undefined`) pass through. **`string` and `bigint`** are cut to `maxStr`.
- **Functions and symbols** are dropped.
- **`Error`**: `name`, `message` and `stack` are always included. `cause` is followed recursively, including the non-enumerable `cause` set by `new Error(msg, { cause })`. Own enumerable custom fields (`code`, `status`, `query`, ...) are kept.
- **Circular references and values past `maxDepth`** become `"[unserializable]"`. Nothing throws.

## License

MIT
