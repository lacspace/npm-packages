<div align="center">

# @lacspace/hotkeys

**Ergonomic keyboard shortcuts for React — combos, sequences, scopes and `⌘K` formatting.**

[![npm version](https://img.shields.io/npm/v/@lacspace/hotkeys?color=%2338bdf8&label=npm)](https://www.npmjs.com/package/@lacspace/hotkeys)
[![install size](https://packagephobia.com/badge?p=@lacspace/hotkeys)](https://packagephobia.com/result?p=@lacspace/hotkeys)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/hotkeys?label=minzip)](https://bundlephobia.com/package/@lacspace/hotkeys)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/hotkeys)
[![license](https://img.shields.io/npm/l/@lacspace/hotkeys?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> `useHotkeys` for combos (`mod+k`), key sequences (`g then d`), named scopes, and pretty display formatting (`⌘K`). SSR-safe, respects form fields, zero-dependency, fully typed.

- **`mod` does the right thing** — Cmd on macOS, Ctrl everywhere else.
- **Sequences** — Gmail-style `g then d` chords with a rolling timeout.
- **Scopes** — enable/disable groups of shortcuts without unmounting anything.
- **Display helper** — render `⌘⇧K` / `Ctrl+Shift+K` from a single string.
- **SSR-safe** — listeners attach only in effects; every `window`/`navigator` access is guarded.
- **Respects form fields** — ignores typing in inputs/textareas/`contentEditable` by default.

> **New in 1.1.0** — the matching engine is now a **pure, React-free core** you can use anywhere (Vue, vanilla, tests, the server): `matchHotkey(combo, event, { platform })`, `parseSequence`, `createSequenceMatcher` (a sequence matcher with an **injectable clock**), `scopesActive` (pure scope gating), and `shouldIgnore` (configurable input-ignore predicate). `formatHotkey` also accepts `{ platform: "mac" | "other" }`. Everything is fully backward compatible — no existing export changed.

## Install

```bash
npm i @lacspace/hotkeys
```

React `>=18` is a peer dependency. This is a hooks-only library — no `"use client"` shipped; add the directive in your own component files when using the App Router.

## Usage

### 1. A basic `mod+k` command palette

```tsx
import { useState } from "react";
import { useHotkeys, formatHotkey } from "@lacspace/hotkeys";

function App() {
  const [open, setOpen] = useState(false);

  // ⌘K on mac, Ctrl+K elsewhere. preventDefault is on by default.
  useHotkeys("mod+k", () => setOpen((v) => !v));

  return (
    <>
      <button onClick={() => setOpen(true)}>
        Search <kbd>{formatHotkey("mod+k")}</kbd>
      </button>
      {open && <CommandPalette onClose={() => setOpen(false)} />}
    </>
  );
}
```

### 2. A `g then d` sequence

```tsx
import { useHotkeys } from "@lacspace/hotkeys";
import { useRouter } from "next/navigation";

function Shortcuts() {
  const router = useRouter();

  // Press "g", then "d" within ~1 second.
  useHotkeys("g then d", () => router.push("/dashboard"));
  useHotkeys("g then s", () => router.push("/settings"));

  // Arrays work too — any combo fires the handler.
  useHotkeys(["?", "shift+/"], () => openHelp());

  return null;
}
```

### 3. Rendering the hint with `formatHotkey`

```tsx
import { formatHotkey } from "@lacspace/hotkeys";

// Auto-detects the platform:
formatHotkey("mod+shift+k");           // "⌘⇧K" on mac, "Ctrl+Shift+K" elsewhere

// Force a platform (useful for docs / screenshots):
formatHotkey("ctrl+shift+k", { mac: false }); // "Ctrl+Shift+K"
formatHotkey("mod+enter", { mac: true });      // "⌘↵"
```

### 4. Scopes

Bind shortcuts to a named scope; they only fire while that scope is active. No provider required.

```tsx
import {
  useHotkeys,
  useHotkeysScopes,
  enableScope,
  disableScope,
} from "@lacspace/hotkeys";

function Editor() {
  // Only fires while the "editor" scope is active.
  useHotkeys("mod+b", () => toggleBold(), { scopes: "editor" });
  useHotkeys("mod+i", () => toggleItalic(), { scopes: "editor" });

  return (
    <div
      onFocus={() => enableScope("editor")}
      onBlur={() => disableScope("editor")}
    >
      …
    </div>
  );
}

function ScopeIndicator() {
  const { activeScopes, toggleScope } = useHotkeysScopes();
  return (
    <button onClick={() => toggleScope("editor")}>
      Editor shortcuts: {activeScopes.includes("editor") ? "on" : "off"}
    </button>
  );
}
```

You can also scope to a specific element via `target`:

```tsx
const boxRef = useRef<HTMLDivElement>(null);
useHotkeys("escape", () => close(), { target: boxRef, enableOnFormTags: true });
```

## API

### `useHotkeys(keys, handler, options?, deps?)`

Binds one or more shortcuts for a component's lifetime.

- `keys: string | string[]` — a combo (`"mod+k"`), a sequence (`"g then d"` / `"g d"`), or an array of them.
- `handler: (event: KeyboardEvent, combo: string) => void` — receives the event and the matched combo string. Kept in a ref, so `deps` are optional.
- `options?: HotkeyOptions`
  - `enabled?` (default `true`)
  - `preventDefault?` (default `true`)
  - `enableOnFormTags?` (default `false`) — when `false`, events from `input`/`textarea`/`select`/`contentEditable` are ignored.
  - `eventType?: "keydown" | "keyup"` (default `"keydown"`)
  - `target?: Window | HTMLElement | RefObject<HTMLElement | null>` (default `window`)
  - `scopes?: string | string[]` — fire only when at least one is active.
- `deps?: unknown[]` — rarely needed thanks to the latest-ref handler.

### `parseHotkey(str): ParsedHotkey`

Parses `"mod+shift+k"` → `{ key, mod, ctrl, alt, shift, meta }`. Modifiers: `mod`, `ctrl`/`control`, `alt`/`option`, `shift`, `meta`/`cmd`/`command`/`win`. Key aliases: `esc`→`escape`, `space`→`" "`, `up`/`down`/`left`/`right`→`arrow*`, etc.

### `matchesHotkey(event, combo): boolean`

Returns `true` when a `KeyboardEvent` satisfies a combo. `mod` → `metaKey` on mac, `ctrlKey` otherwise. Modifiers must match exactly.

### `formatHotkey(combo, opts?): string`

Pretty display: mac → `"⌘⇧K"`, non-mac → `"Ctrl+Shift+K"`. Auto-detects platform unless overridden. `opts`: `{ platform?: "mac" | "other"; mac?: boolean }` — `platform` (new in 1.1.0) takes precedence over the legacy `mac` boolean, which still works.

### `isMac(): boolean`

SSR-safe platform check (returns `false` on the server).

### Pure core (React-free) — new in 1.1.0

Every matcher below is a plain function over plain data — no React, no DOM required — so you can reuse the exact same logic in a non-React app, on the server, or in fast unit tests. `Platform` is `"mac" | "other"`; a synthetic event is `{ key, ctrlKey?, metaKey?, altKey?, shiftKey? }` (`KeyEventLike`).

| Export | Signature | What it does |
| --- | --- | --- |
| `matchHotkey` | `(combo: string \| ParsedHotkey, event: KeyEventLike, opts?: { platform?: Platform }) => boolean` | Pure, platform-injectable combo match. `mod` → `metaKey` on `"mac"`, `ctrlKey` on `"other"`. Modifiers must match exactly. |
| `parseSequence` | `(str: string) => ParsedHotkey[]` | Parse `"g then d"` / `"g d"` / `"mod+k"` into ordered combo steps. |
| `createSequenceMatcher` | `(combo: string \| ParsedHotkey[], opts?: { timeout?: number; platform?: Platform }) => SequenceMatcher` | A stateful chord matcher with an **injected clock**: `m.handle(event, now)` returns `true` on the event that completes the sequence; `m.reset()` restarts. |
| `scopesActive` | `(required: string \| readonly string[] \| null \| undefined, active: Iterable<string>) => boolean` | Pure scope gate — unscoped always fires, otherwise fires when **any** required scope is active. |
| `shouldIgnore` | `(target: IgnoreTargetLike \| null, opts?: ShouldIgnoreOptions) => boolean` | Pure predicate: is focus in an editable field? Skips `input`/`textarea`/`select`/`contentEditable`/editable roles; configurable via `enableOnFormTags`, `ignoreTags`, `ignoreContentEditable`, `ignoreRoles`. |
| `resolvePlatform` | `(platform?: Platform) => Platform` | `platform` if given, else auto-detect via `isMac()`. |
| `isModifierKey` | `(key: string) => boolean` | Whether an `event.key` is a lone modifier (`Shift`, `Meta`, …). |

```ts
import {
  matchHotkey,
  createSequenceMatcher,
  scopesActive,
  shouldIgnore,
  formatHotkey,
} from "@lacspace/hotkeys";

// Platform-injectable matching — no DOM, no navigator:
matchHotkey("mod+k", { key: "k", metaKey: true }, { platform: "mac" });   // true
matchHotkey("mod+k", { key: "k", ctrlKey: true }, { platform: "other" }); // true

// A sequence matcher with an injected clock (great for tests):
const m = createSequenceMatcher("g then d", { platform: "other", timeout: 1000 });
m.handle({ key: "g" }, 0);   // false — first step
m.handle({ key: "d" }, 500); // true  — completed within the window

// Pure scope gating + input guard:
scopesActive("editor", new Set(["editor"]));      // true
shouldIgnore({ tagName: "INPUT" });               // true
shouldIgnore({ tagName: "DIV" });                 // false

// Force a platform when formatting (docs / screenshots):
formatHotkey("mod+shift+k", { platform: "mac" }); // "⌘⇧K"
```

### Scopes

`enableScope(name)`, `disableScope(name)`, `toggleScope(name)`, `isScopeActive(name)`, and `useHotkeysScopes()` → `{ activeScopes, enableScope, disableScope, toggleScope }`. Backed by `useSyncExternalStore` — no provider, concurrent-safe, SSR-safe.

## Why it's tiny

No dependencies. No context providers. Combos and sequences are matched by comparing native `KeyboardEvent` fields against parsed strings — no synthetic key state to maintain. Scopes are a single module-level `Set` exposed through `useSyncExternalStore`. Handlers live in refs, so re-renders never re-bind listeners, and there is nothing to tree-shake away that you did not import.

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/hotkeys` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/hotkeys
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

