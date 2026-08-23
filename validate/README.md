<div align="center">

# @lacspace/validate

**A tiny, typed schema validator — zod's ergonomics, zero dependencies.**

[![npm version](https://img.shields.io/npm/v/@lacspace/validate?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/validate)
[![license](https://img.shields.io/npm/l/@lacspace/validate?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> `parse` / `safeParse`, objects, arrays, enums, unions, coercion and full type inference — in a package small enough to drop into any function, edge runtime or bundle. No dependencies, isomorphic, fully typed.

## Install

```bash
npm i @lacspace/validate
```

## Use it

```ts
import { v, type Infer } from "@lacspace/validate";

const User = v.object({
  name: v.string().min(2).trim(),
  email: v.string().email().toLowerCase(),
  age: v.coerce.number().int().min(0).optional(),
  role: v.enum(["admin", "user"]).default("user"),
  tags: v.array(v.string()).max(10).default([]),
});

type User = Infer<typeof User>;
//   ^ { name: string; email: string; role: "admin" | "user"; tags: string[]; age?: number }

User.parse(input);      // ✅ returns typed data, or throws ValidationError
User.safeParse(input);  // ✅ { success: true, data } | { success: false, error }
```

## Why coercion matters

`FormData`, query strings and env vars are **all strings**. The `v.coerce.*` helpers turn `"42"` → `42` and `"true"` → `true` before validating — so the same schema validates a JSON body *and* an HTML form.

```ts
const Query = v.object({
  page: v.coerce.number().int().positive().default(1),
  published: v.coerce.boolean().default(false),
});
Query.parse({ page: "3", published: "yes" }); // { page: 3, published: true }
```

## Field errors, ready for a form

```ts
const r = User.safeParse(input);
if (!r.success) {
  r.error.flatten();
  // { "email": "Invalid email address", "name": "Must be at least 2 characters" }
}
```

## The toolbox

| | |
| --- | --- |
| **Primitives** | `string` · `number` · `boolean` · `date` · `literal` · `enum` · `any` |
| **Composites** | `object` · `array` · `union` · `record` |
| **String checks** | `min` `max` `length` `nonempty` `email` `url` `uuid` `regex` `startsWith` `endsWith` `trim` `toLowerCase` `toUpperCase` |
| **Number checks** | `min` `max` `gt` `lt` `int` `positive` `nonnegative` `finite` |
| **Object modes** | `.strict()` · `.passthrough()` · `.partial()` · `.fields` |
| **Modifiers** | `.optional()` · `.nullable()` · `.nullish()` · `.default()` · `.refine()` · `.transform()` |
| **Coercion** | `v.coerce.string()` · `v.coerce.number()` · `v.coerce.boolean()` |

Pairs perfectly with [`@lacspace/form`](https://www.npmjs.com/package/@lacspace/form) for end-to-end typed form handling and [`@lacspace/env`](https://www.npmjs.com/package/@lacspace/env) for config.

## Licensing

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

---

<div align="center">

**Part of the Lacspace ecosystem — zero-dependency, isomorphic TypeScript packages.**

[All packages ↗](https://lacspace.com/packages) · [npm org ↗](https://www.npmjs.com/org/lacspace) · [Licence Centre ↗](https://lacspace.com/licenses) · [GitHub ↗](https://github.com/lacspace/npm-packages)

</div>

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
