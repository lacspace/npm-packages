<div align="center">

# @lacspace/form

**Typed, validated, spam-protected form handling — built for Next.js Server Actions.**

[![npm version](https://img.shields.io/npm/v/@lacspace/form?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/form)
[![license](https://img.shields.io/npm/l/@lacspace/form?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Take a `FormData`, validate it against a schema, block bots with a honeypot + timing check, and get back **either your typed data or per-field errors ready to re-render**. Framework-agnostic, zero dependencies.

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

## Licensing

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

---

<div align="center">

**Part of the Lacspace ecosystem — zero-dependency, isomorphic TypeScript packages.**

[All packages ↗](https://lacspace.com/packages) · [npm org ↗](https://www.npmjs.com/org/lacspace) · [Licence Centre ↗](https://lacspace.com/licenses) · [GitHub ↗](https://github.com/lacspace/npm-packages)

</div>

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
