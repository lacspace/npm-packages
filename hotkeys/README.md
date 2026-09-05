# @lacspace/hotkeys

**Ergonomic keyboard shortcuts for React** — combos (`mod+k`), key sequences (`g then d`), scopes, and pretty display formatting (`⌘K`). SSR-safe, respects form fields, zero-dependency, fully typed.

- **`mod` does the right thing** — Cmd on macOS, Ctrl everywhere else.
- **Sequences** — Gmail-style `g then d` chords with a rolling timeout.
- **Scopes** — enable/disable groups of shortcuts without unmounting anything.
- **Display helper** — render `⌘⇧K` / `Ctrl+Shift+K` from a single string.
- **SSR-safe** — listeners attach only in effects; every `window`/`navigator` access is guarded.
- **Respects form fields** — ignores typing in inputs/textareas/`contentEditable` by default.

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

Pretty display: mac → `"⌘⇧K"`, non-mac → `"Ctrl+Shift+K"`. Auto-detects platform unless `opts.mac` is set.

### `isMac(): boolean`

SSR-safe platform check (returns `false` on the server).

### Scopes

`enableScope(name)`, `disableScope(name)`, `toggleScope(name)`, `isScopeActive(name)`, and `useHotkeysScopes()` → `{ activeScopes, enableScope, disableScope, toggleScope }`. Backed by `useSyncExternalStore` — no provider, concurrent-safe, SSR-safe.

## Why it's tiny

No dependencies. No context providers. Combos and sequences are matched by comparing native `KeyboardEvent` fields against parsed strings — no synthetic key state to maintain. Scopes are a single module-level `Set` exposed through `useSyncExternalStore`. Handlers live in refs, so re-renders never re-bind listeners, and there is nothing to tree-shake away that you did not import.

## Licensing

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/hotkeys` is part of **63 zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/hotkeys
- 🗂️ **All 63 packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

