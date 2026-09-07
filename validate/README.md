<div align="center">

# @lacspace/validate

**A tiny, typed schema validator — zod's ergonomics, zero dependencies.**

[![npm version](https://img.shields.io/npm/v/@lacspace/validate?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/validate)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/validate?label=minzip)](https://bundlephobia.com/package/@lacspace/validate)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/validate)
[![license](https://img.shields.io/npm/l/@lacspace/validate?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> `parse` / `safeParse`, objects, arrays, enums, unions, coercion and full type inference — in a package small enough to drop into any function, edge runtime or bundle. No dependencies, isomorphic, fully typed.

> **New in 1.1.0** — `tuple`, `intersection`/`.and`, `discriminatedUnion`, `lazy` (recursive), `nativeEnum`, `map`/`set`, `instanceof`, `unknown`/`never`/`void`, `bigint`; `.superRefine()`, `.pipe()`, `.catch()`, `.brand()`, `.or()`; `coerce.date`/`coerce.bigint`; string `datetime`/`ip`/`cuid`, number `negative`/`multipleOf`/`safe`, array `length`; and `error.format()` for nested field-error trees. **100% backward compatible — everything above is additive.**

- 🧩 Chainable schemas — `v.string().email()`, `v.number().int()`, `v.object({...})`, `v.array()`, `v.union()`, `v.enum()`
- 🧠 `Infer<typeof Schema>` — the static type is derived from the schema, one source of truth
- 🔀 `v.coerce.*` — turn stringy `FormData` / query / env values into numbers & booleans before validating
- ✅ `parse` throws a `ValidationError`; `safeParse` returns `{ success, data | error }`, with `error.flatten()` for forms
- 🌍 Zero dependencies · isomorphic · fully typed

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

## Discriminated unions, recursion & pipelines

```ts
// discriminatedUnion — picks the branch by a literal key (fast + precise errors)
const Event = v.discriminatedUnion("type", [
  v.object({ type: v.literal("click"), x: v.number(), y: v.number() }),
  v.object({ type: v.literal("key"), code: v.string() }),
]);

// lazy — recursive schemas
import { v, type Schema } from "@lacspace/validate";
type Comment = { text: string; replies: Comment[] };
const Comment: Schema<Comment> = v.lazy(() =>
  v.object({ text: v.string(), replies: v.array(Comment) }),
);

// superRefine — cross-field validation with a custom path
const Signup = v.object({ pw: v.string(), confirm: v.string() }).superRefine((val, ctx) => {
  if (val.pw !== val.confirm) ctx.addIssue({ message: "Passwords must match", path: ["confirm"] });
});

// pipe / catch — compose and provide fallbacks
const Port = v.coerce.number().pipe(v.number().int().min(1).max(65535));
const Retries = v.coerce.number().int().catch(3); // bad input → 3

// format() — nested error tree for forms
Signup.safeParse(input).error?.format();
// { _errors: [], confirm: { _errors: ["Passwords must match"] } }
```

## The toolbox

| | |
| --- | --- |
| **Primitives** | `string` · `number` · `bigint` · `boolean` · `date` · `literal` · `enum` · `nativeEnum` · `any` · `unknown` · `never` · `void` |
| **Composites** | `object` · `array` · `tuple` · `union` · `intersection` · `discriminatedUnion` · `record` · `map` · `set` · `lazy` · `instanceof` |
| **String checks** | `min` `max` `length` `nonempty` `email` `url` `uuid` `regex` `startsWith` `endsWith` `datetime` `ip` `cuid` `trim` `toLowerCase` `toUpperCase` |
| **Number checks** | `min` `max` `gt` `lt` `int` `positive` `negative` `nonnegative` `nonpositive` `multipleOf` `finite` `safe` |
| **Array / set checks** | `min` `max` `length` `nonempty` |
| **Object modes** | `.strict()` · `.passthrough()` · `.partial()` · `.fields` |
| **Modifiers** | `.optional()` · `.nullable()` · `.nullish()` · `.default()` · `.catch()` · `.refine()` · `.superRefine()` · `.transform()` · `.pipe()` · `.brand()` · `.and()` · `.or()` |
| **Coercion** | `v.coerce.string()` · `v.coerce.number()` · `v.coerce.boolean()` · `v.coerce.date()` · `v.coerce.bigint()` |
| **Errors** | `error.issues` · `error.flatten()` · `error.format()` |

Pairs perfectly with [`@lacspace/form`](https://www.npmjs.com/package/@lacspace/form) for end-to-end typed form handling and [`@lacspace/env`](https://www.npmjs.com/package/@lacspace/env) for config.

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/validate` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/validate
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

