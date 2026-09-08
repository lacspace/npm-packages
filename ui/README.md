<div align="center">

# @lacspace/ui

**The React kit that makes a page feel alive — reveals, count-ups, tilt, ⌘K. Zero dependencies.**

[![npm version](https://img.shields.io/npm/v/@lacspace/ui?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/ui)
[![install size](https://packagephobia.com/badge?p=@lacspace/ui)](https://packagephobia.com/result?p=@lacspace/ui)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/ui?label=minzip)](https://bundlephobia.com/package/@lacspace/ui)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/ui)
[![license](https://img.shields.io/npm/l/@lacspace/ui?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Scroll reveals, animated counters, gradient text, tilt cards, marquees, a typewriter and a command palette — **no animation library, no CSS import, no config**. Every component respects `prefers-reduced-motion` and takes a `className`, so it drops straight into a Tailwind + Next.js App Router project. React is the only peer dependency.

## Install

```bash
npm i @lacspace/ui
```

The package ships `"use client"`, so you can import it directly into Server Components.

## Components

```tsx
import { Reveal, Counter, GradientText, TiltCard, Marquee, Typewriter, CommandPalette } from "@lacspace/ui";

// Fade + slide in on scroll (stagger with `delay`)
<Reveal delay={0.1}><h2>It just appears, beautifully.</h2></Reveal>

// Count up when it enters the viewport
<Counter value={12480} suffix="+" />       // 12,480+

// Gradient (optionally animated) text
<GradientText from="#22d3ee" to="#6366f1" animate>Lacspace</GradientText>

// 3D tilt toward the cursor
<TiltCard className="rounded-2xl border p-6">Hover me</TiltCard>

// Infinite logo / testimonial strip
<Marquee speed={20} pauseOnHover><Logo/><Logo/><Logo/></Marquee>

// Rotating headline
<Typewriter words={["faster", "safer", "beautifully"]} />

// ⌘K / Ctrl-K command palette
<CommandPalette
  items={[
    { id: "home", label: "Go home", shortcut: "G H", onSelect: () => router.push("/") },
    { id: "docs", label: "Read the docs", group: "Help", onSelect: () => router.push("/docs") },
  ]}
/>
```

## Hooks

| | |
| --- | --- |
| `useInView(opts)` | `[ref, inView]` via IntersectionObserver — `{ threshold, once, rootMargin }` |
| `usePrefersReducedMotion()` | `true` when the user opted out of motion |
| `cn(...)` | tiny class-name joiner |

## Pure helpers · New in 1.1.0

The math and formatting that power the components are now exported as **pure,
framework-agnostic functions** — no React, no DOM. Use them to drive your own
animations, hotkey lists, counters and gradients, and test them anywhere.

```ts
import {
  cx, clamp, lerp, mapRange, easings, ease, formatCount, linearGradient,
  tiltTransform, pointerFraction, nextIndex, scoreMatch, filterCommands,
  rankCommands, typewriterStep, createUid, stagger,
} from "@lacspace/ui";

formatCount(12480, { suffix: "+" });                 // "12,480+"
linearGradient("#22d3ee", "#6366f1");                // "linear-gradient(135deg, #22d3ee, #6366f1)"
ease("easeOutCubic", 0.4);                           // eased progress in [0,1]
nextIndex(2, 1, 3, { loop: true });                  // 0  (wrap-around list nav)
rankCommands(items, "settings", (i) => i.label);     // best matches first
stagger(3);                                          // 0.24s — delay for the 3rd Reveal
```

| | |
| --- | --- |
| `cx(...parts: ClassValue[]): string` | class joiner that also accepts numbers |
| `clamp(n, min, max)` · `lerp(a, b, t)` · `mapRange(n, inMin, inMax, outMin, outMax)` | number math |
| `easings` · `ease(name, t)` | named easing functions (`easeOutCubic`, `easeOutBack`, …), `t` clamped to `[0,1]` |
| `formatCount(value, { decimals?, separator?, prefix?, suffix? })` | the `<Counter>` display formatter |
| `linearGradient(from, to, angle?)` | build a `linear-gradient(...)` string |
| `tiltTransform({ px, py, max?, scale?, perspective? })` · `pointerFraction(rect, x, y)` | the `<TiltCard>` 3D-tilt math |
| `nextIndex(current, delta, length, { loop? })` | roving/arrow-key selection index |
| `scoreMatch(text, query)` · `filterCommands(items, q, key?)` · `rankCommands(items, q, key?)` | command-palette filtering & ranking |
| `typewriterStep(words, state, timing?)` | pure `<Typewriter>` state machine → `{ state, delay }` |
| `createUid(prefix?)` · `stagger(index, step?, base?)` | deterministic ids & stagger timing |

## Why it's tiny

No `framer-motion`, no `cmdk`, no runtime CSS-in-JS. Animations use CSS transitions, `requestAnimationFrame` and `IntersectionObserver` — the platform. The whole kit gzips to a few KB and tree-shakes to only what you import.

Pairs beautifully with [`create-lacspace-app`](https://www.npmjs.com/package/create-lacspace-app) (every template ships with it wired in) and [`@lacspace/og`](https://www.npmjs.com/package/@lacspace/og).

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/ui` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/ui
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

