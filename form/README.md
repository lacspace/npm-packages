<div align="center">

# @lacspace/form

**Typed, validated, spam-protected form handling — built for Next.js Server Actions.**

[![npm version](https://img.shields.io/npm/v/@lacspace/form?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/form)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/form?label=minzip)](https://bundlephobia.com/package/@lacspace/form)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/form)
[![license](https://img.shields.io/npm/l/@lacspace/form?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Take a `FormData`, validate it against a schema, block bots with a honeypot + timing check, and get back **either your typed data or per-field errors ready to re-render**. Framework-agnostic, zero dependencies.

> **New in 1.1.0 — a client-side form STATE engine.** Alongside the server handler, `@lacspace/form` now ships a tiny **framework-free reducer** for interactive forms: `values` / `errors` / `touched` / `dirty`, sync **and** async validation (validate-on-change/blur/submit), nested dot/bracket paths, field-array ops (push/remove/insert/move/swap) that keep errors & touched aligned by index, and a `handleSubmit` that routes to `onValid` / `onInvalid`. The whole engine is a **pure reducer** — no React, no DOM — with a thin `createFormStore` (subscribe/dispatch) on top. Fully backward compatible; every existing export is unchanged.

- 📥 `formDataToObject(fd)` — `FormData` → plain object (repeated keys → arrays, files passed through)
- ✅ `createForm({ schema })` → `{ handle, action }` — `action` drops straight into React's `useActionState`
- 🍯 Spam guard — a `honeypot` field + `minSubmitMs` timing check, internal fields stripped before validation
- 🎯 Typed result — `{ ok: true, data }` or `{ ok: false, errors, values, spam? }` to re-render with input intact
- 🌍 Zero dependencies · isomorphic · fully typed

## Install

```bash
npm i @lacspace/form @lacspace/validate
```

`@lacspace/validate` is optional — any object with a `safeParse` (including zod) works.

## Use it — a complete contact form

```ts
// app/actions.ts
"use server";
import { createForm } from "@lacspace/form";
import { v } from "@lacspace/validate";

const contact = createForm({
  schema: v.object({
    name: v.string().min(2),
    email: v.string().email(),
    message: v.string().min(10),
  }),
  honeypot: "company",   // hidden field bots fill; humans never see it
  minSubmitMs: 800,      // reject sub-second (bot-speed) submissions
});

export async function submit(prev: unknown, formData: FormData) {
  const r = contact.action(prev, formData);
  if (!r.ok) return r;              // { errors, values } → re-render form
  await sendEmail(r.data);          // ✅ { name, email, message } fully typed
  return { ok: true as const };
}
```

```tsx
// app/contact/page.tsx
"use client";
import { useActionState } from "react";
import { submit } from "../actions";
import { honeypotProps, timestampValue } from "@lacspace/form";

export default function Contact() {
  const [state, action] = useActionState(submit, null);
  return (
    <form action={action}>
      <input name="name" defaultValue={state?.values?.name as string} />
      {state?.errors?.name && <p>{state.errors.name}</p>}

      <input name="email" defaultValue={state?.values?.email as string} />
      {state?.errors?.email && <p>{state.errors.email}</p>}

      <textarea name="message" defaultValue={state?.values?.message as string} />
      {state?.errors?.message && <p>{state.errors.message}</p>}

      {/* spam protection — one line each */}
      <input {...honeypotProps("company")} />
      <input type="hidden" name="_ts" defaultValue={timestampValue()} />

      <button>Send</button>
      {state?.ok && <p>Thanks — we'll be in touch!</p>}
    </form>
  );
}
```

## What you get

- **`createForm(opts)`** → `{ handle, action }` — `action` matches the `(prev, formData)` shape of `useActionState`, so it drops in with zero glue.
- **Typed result** — `{ ok: true, data }` or `{ ok: false, errors, values, spam? }`. `values` echoes what the user typed so re-renders keep their input.
- **`formDataToObject(fd)`** — repeated keys → arrays, files passed through, empty strings preserved.
- **Spam guard** — `honeypot` field + `minSubmitMs` timing heuristic, both optional. Internal fields (`_ts`, honeypot) are stripped before validation so your schema can stay `.strict()`.
- **`honeypotProps(name)`** + **`timestampValue()`** — client helpers, no React dependency.

Pairs with [`@lacspace/validate`](https://www.npmjs.com/package/@lacspace/validate), [`@lacspace/rate-limit`](https://www.npmjs.com/package/@lacspace/rate-limit) and [`@lacspace/mailer`](https://www.npmjs.com/package/@lacspace/mailer).

## Client-side form state (new in 1.1.0)

The server handler above owns validation on submit. For **interactive** forms — live errors, dirty tracking, dynamic field arrays — use the state engine. It's a **pure reducer** plus a thin store, so it drives a React `useSyncExternalStore` (or anything) without this package importing React.

```ts
import { createFormStore } from "@lacspace/form";

const store = createFormStore({
  initialValues: { name: "", email: "", tags: [] as string[] },
  // Injected validator — sync OR async. Return a flat, dot-path error map.
  validate: (v) => {
    const e: Record<string, string> = {};
    if (!v.name) e.name = "Required";
    if (!v.email.includes("@")) e.email = "Invalid email";
    return e;
  },
  validateOn: ["change", "submit"],   // default: ["submit"]
});

store.setValue("name", "Ada");        // → dirty + revalidated
store.setTouched("email");            // → blur; revalidated if validateOn has "blur"
store.push("tags", "web");            // field-array op (also remove/insert/move/swap)

store.isDirty();                       // true
store.getFieldState("email");          // { value, error, touched, dirty }

await store.handleSubmit(
  (values) => save(values),            // onValid — validation passed
  (errors) => console.log(errors),     // onInvalid — optional
);
```

### Using the pure core directly

Everything is exported, so you can drive the reducer yourself (great for tests — no DOM needed):

```ts
import { initFormState, formReducer, dirtyFields, runSubmit } from "@lacspace/form";

let s = initFormState({ items: ["a", "b", "c"] });
s = formReducer(s, { type: "ARRAY_REMOVE", path: "items", index: 0 }); // errors/touched realign
s = formReducer(s, { type: "SET_VALUE", path: "items.0", value: "z" });

dirtyFields(s.values, s.initialValues); // { "items.0": true, ... }

// Pure, async-injectable submit routing:
const res = await runSubmit(s, {
  validate: async (v) => (v.items.length ? {} : { items: "empty" }),
  onValid: (v) => save(v),
  onInvalid: (errors) => report(errors),
});
res.ok; // boolean
```

### API — state engine

| Export | What it does |
| --- | --- |
| `createFormStore(config)` | Framework-free store: `getState`, `subscribe`, `setValue`/`setFieldValue`, `setValues`, `patchValues`, `setError(s)`, `setTouched`, `reset`, `resetField`, array `push`/`remove`/`insert`/`move`/`swap`, `validate`, `handleSubmit`, `isValid`/`isDirty`/`dirtyFields`/`getFieldState`. |
| `formReducer(state, action)` | The **pure** state reducer (values/errors/touched/submit + `ARRAY_*` ops). |
| `initFormState(initialValues)` | Build the initial `FormState`. |
| `runValidator(values, validate?)` | Run an injected sync/async validator → `Promise<FormErrors>`. |
| `runSubmit(state, { validate, onValid, onInvalid })` | Pure/async submit orchestration: touch-all, validate, route. |
| `getPath` / `setPath` / `parsePath` | Nested dot/bracket get / immutable set / path parse. |
| `dirtyFields` / `isDirty` / `isValid` / `getFieldState` / `leafPaths` / `deepEqual` | Derivations & diff helpers. |

`config`: `{ initialValues, validate?, validateOn? }` where `validateOn` is `"change" \| "blur" \| "submit"` (or an array; default `["submit"]`).

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/form` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/form
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

