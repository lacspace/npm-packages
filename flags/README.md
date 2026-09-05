<div align="center">

# @lacspace/flags

**Feature flags & A/B experiments with no SaaS and no infrastructure — deterministic, synchronous, zero-dependency.**

[![npm version](https://img.shields.io/npm/v/@lacspace/flags?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/flags)
[![install size](https://packagephobia.com/badge?p=@lacspace/flags)](https://packagephobia.com/result?p=@lacspace/flags)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/flags?label=minzip)](https://bundlephobia.com/package/@lacspace/flags)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/flags)
[![license](https://img.shields.io/npm/l/@lacspace/flags?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Feature flagging is dominated by hosted vendors (LaunchDarkly, Optimizely, Unleash). But you don't always want a SaaS, a network call, or a monthly bill. **You** own the config — a plain object from JSON, env or a DB row — and this evaluates it: stable rollouts, targeting and A/B tests, synchronously, offline.

- 🎯 **Deterministic** — the same user always gets the same result (no flicker, no round-trip, works offline)
- 📊 Percentage rollouts + **weighted A/B / multivariate experiments**
- 🧩 Targeting rules on attributes — `eq` / `in` / `gt` / `contains` / `regex` …
- ⚡ **Synchronous** (evaluate right in render) · zero dependencies · isomorphic

## Install

```bash
npm install @lacspace/flags      # or pnpm add / yarn add / bun add
```

## Define once, evaluate anywhere

```ts
import { Flags } from "@lacspace/flags";

// Config — load from JSON / env / DB, hot-swap with flags.update(...)
export const flags = new Flags({
  "new-dashboard": { rollout: 25 },                              // 25% of users
  "beta": { rules: [{ when: { plan: "pro" }, value: true }] },   // pro users only
  "eu-feature": { rules: [{ when: { country: { in: ["DE", "FR"] } }, value: true }] },
  "checkout-exp": {                                              // A/B test
    type: "variant",
    variants: [{ key: "control", weight: 1 }, { key: "one-click", weight: 1 }],
  },
});

// Evaluate — synchronous, stable per user
flags.isEnabled("new-dashboard", { key: user.id });                       // boolean
flags.isEnabled("beta", { key: user.id, attributes: { plan: user.plan } });
flags.variant("checkout-exp", { key: user.id });                          // "control" | "one-click"
```

The same `key` always buckets the same way — a user in the 25% rollout stays in it across reloads and devices, and always sees the same experiment variant.

## Targeting rules

```ts
new Flags({
  "premium-banner": {
    rollout: 0,                         // off for everyone by default…
    rules: [
      { when: { plan: "pro" }, value: true },                 // …except pro users
      { when: { signupDays: { gte: 30 } }, rollout: 50 },     // …and 50% of 30-day-olds
      { when: { email: { regex: "@lacspace\\.com$" } }, value: true }, // …and staff
    ],
  },
});
```

Operators: `eq`, `ne`, `in`, `nin`, `gt`, `gte`, `lt`, `lte`, `contains`, `regex` (a bare value means equality). Rules are evaluated top-to-bottom; the first match wins.

## Bootstrap a client (no flicker)

```ts
// server: evaluate everything once, ship it with the page
const initial = flags.all({ key: user.id, attributes });
// → { "new-dashboard": true, "beta": false, "checkout-exp": "one-click", … }
```

## API

| Export | Description |
| --- | --- |
| `new Flags(config)` | build a flag set from a config object |
| `.isEnabled(key, ctx)` | boolean flag → `boolean` |
| `.variant(key, ctx)` | variant flag → variant key |
| `.evaluate(key, ctx)` · `.all(ctx)` | generic / evaluate-all |
| `.update(config)` · `.set(key, def)` | hot-reload config |
| `isEnabled(key, def, ctx)` · `variant(key, def, ctx)` | functional (no store) |
| `bucket(key)` · `percentage(flag, ctx)` | inspect the deterministic bucketing |

Context is `{ key, attributes? }`. `key` drives bucketing; `attributes` drive targeting. Set a flag's `seed` to re-shuffle everyone. No rules → `rollout` defaults to 100%; with rules, unmatched users default to off unless you set an explicit `rollout`.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/flags` is part of **63 zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/flags
- 🗂️ **All 63 packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

