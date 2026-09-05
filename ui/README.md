<div align="center">

# @lacspace/ui

**The React kit that makes a page feel alive — reveals, count-ups, tilt, ⌘K. Zero dependencies.**

[![npm version](https://img.shields.io/npm/v/@lacspace/ui?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/ui)
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

## Why it's tiny

No `framer-motion`, no `cmdk`, no runtime CSS-in-JS. Animations use CSS transitions, `requestAnimationFrame` and `IntersectionObserver` — the platform. The whole kit gzips to a few KB and tree-shakes to only what you import.

Pairs beautifully with [`create-lacspace-app`](https://www.npmjs.com/package/create-lacspace-app) (every template ships with it wired in) and [`@lacspace/og`](https://www.npmjs.com/package/@lacspace/og).

## Licensing

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/ui` is part of **63 zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/ui
- 🗂️ **All 63 packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

