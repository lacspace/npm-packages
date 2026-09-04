/**
 * @lacspace/hotkeys — ergonomic keyboard shortcuts for React.
 *
 * Combos (`mod+k`), key sequences (`g then d`), scopes, and pretty display
 * formatting (`⌘K`). SSR-safe, respects form fields, zero-dependency, fully typed.
 *
 * @packageDocumentation
 */

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { RefObject } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/** A parsed hotkey combo: the resolved key plus each modifier requirement. */
export interface ParsedHotkey {
  /** Normalized key (e.g. `"k"`, `"escape"`, `" "`, `"arrowup"`). */
  key: string;
  /** `mod` — Cmd on mac, Ctrl elsewhere. */
  mod: boolean;
  /** Control key. */
  ctrl: boolean;
  /** Alt / Option key. */
  alt: boolean;
  /** Shift key. */
  shift: boolean;
  /** Meta / Cmd / Win key. */
  meta: boolean;
}

/** The handler invoked when a hotkey (or the final step of a sequence) fires. */
export type HotkeyHandler = (event: KeyboardEvent, combo: string) => void;

/** Where to attach the key listener. */
export type HotkeyTarget =
  | Window
  | HTMLElement
  | RefObject<HTMLElement | null>;

/** Options for {@link useHotkeys}. */
export interface HotkeyOptions {
  /** Master switch. When `false`, nothing fires. @default true */
  enabled?: boolean;
  /** Call `event.preventDefault()` when a hotkey matches. @default true */
  preventDefault?: boolean;
  /**
   * Allow firing while an `input` / `textarea` / `select` / `contentEditable`
   * element is the event source. @default false
   */
  enableOnFormTags?: boolean;
  /** Which key event to listen for. @default "keydown" */
  eventType?: "keydown" | "keyup";
  /** Where to bind the listener. @default window */
  target?: HotkeyTarget;
  /**
   * Scope name(s). The hotkey only fires when at least one is active
   * (see {@link enableScope}). Omit to always fire.
   */
  scopes?: string | string[];
}

/* -------------------------------------------------------------------------- */
/* Platform detection                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Detects whether the current platform is a Mac (or iOS device).
 *
 * SSR-safe: always returns `false` when there is no `navigator`.
 *
 * @returns `true` on macOS / iOS, `false` otherwise (and on the server).
 *
 * @example
 * ```ts
 * const symbol = isMac() ? "⌘" : "Ctrl";
 * ```
 */
export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaData = (navigator as Navigator & {
    userAgentData?: { platform?: string };
  }).userAgentData;
  if (uaData && typeof uaData.platform === "string" && uaData.platform) {
    return /mac/i.test(uaData.platform);
  }
  const platform = navigator.platform || "";
  if (platform) return /mac|iphone|ipad|ipod/i.test(platform);
  return /mac|iphone|ipad|ipod/i.test(navigator.userAgent || "");
}

/* -------------------------------------------------------------------------- */
/* Parsing                                                                    */
/* -------------------------------------------------------------------------- */

const MOD_TOKENS: Record<string, keyof Omit<ParsedHotkey, "key">> = {
  mod: "mod",
  ctrl: "ctrl",
  control: "ctrl",
  alt: "alt",
  option: "alt",
  opt: "alt",
  shift: "shift",
  meta: "meta",
  cmd: "meta",
  command: "meta",
  win: "meta",
  super: "meta",
};

const KEY_ALIASES: Record<string, string> = {
  esc: "escape",
  space: " ",
  spacebar: " ",
  up: "arrowup",
  down: "arrowdown",
  left: "arrowleft",
  right: "arrowright",
  return: "enter",
  del: "delete",
  ins: "insert",
  pgup: "pageup",
  pgdn: "pagedown",
};

/** Normalize a raw key token into its canonical `event.key` (lowercased) form. */
function normalizeKey(raw: string): string {
  const k = raw.toLowerCase();
  const aliased = KEY_ALIASES[k];
  if (aliased !== undefined) return aliased;
  return k;
}

/**
 * Parses a combo string like `"mod+shift+k"` into modifier flags and a key.
 *
 * Tokens split on `"+"`, case-insensitive. Modifiers: `mod` (Cmd on mac / Ctrl
 * elsewhere), `ctrl`/`control`, `alt`/`option`, `shift`, `meta`/`cmd`/`command`/`win`.
 * The remaining token is the key (`esc`→`escape`, `space`→`" "`, arrows→`arrowup`…,
 * single letters lowercased).
 *
 * @param str - The combo string, e.g. `"mod+k"` or `"ctrl+shift+escape"`.
 * @returns The parsed combo.
 *
 * @example
 * ```ts
 * parseHotkey("mod+shift+k");
 * // { key: "k", mod: true, ctrl: false, alt: false, shift: true, meta: false }
 * ```
 */
export function parseHotkey(str: string): ParsedHotkey {
  const parsed: ParsedHotkey = {
    key: "",
    mod: false,
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
  };
  const tokens = str.split("+");
  for (const token of tokens) {
    const t = token.trim().toLowerCase();
    if (t === "") continue;
    const modKey = MOD_TOKENS[t];
    if (modKey) {
      parsed[modKey] = true;
    } else {
      parsed.key = normalizeKey(token.trim());
    }
  }
  return parsed;
}

/* -------------------------------------------------------------------------- */
/* Matching                                                                   */
/* -------------------------------------------------------------------------- */

/** Match a keyboard event against an already-parsed combo. */
function matchesParsed(
  event: KeyboardEvent,
  parsed: ParsedHotkey,
  mac: boolean,
): boolean {
  const wantMeta = parsed.meta || (mac && parsed.mod);
  const wantCtrl = parsed.ctrl || (!mac && parsed.mod);
  if (event.metaKey !== wantMeta) return false;
  if (event.ctrlKey !== wantCtrl) return false;
  if (event.altKey !== parsed.alt) return false;
  if (event.shiftKey !== parsed.shift) return false;
  return event.key.toLowerCase() === parsed.key;
}

/**
 * Returns `true` when a keyboard event satisfies a combo string.
 *
 * `mod` resolves to `metaKey` on mac and `ctrlKey` elsewhere. Modifiers must
 * match exactly (so `"ctrl+k"` does not fire when `Ctrl+Shift+K` is pressed).
 *
 * @param event - The keyboard event.
 * @param combo - The combo string, e.g. `"mod+k"`.
 * @returns Whether the event satisfies the combo.
 *
 * @example
 * ```ts
 * window.addEventListener("keydown", (e) => {
 *   if (matchesHotkey(e, "mod+k")) openPalette();
 * });
 * ```
 */
export function matchesHotkey(event: KeyboardEvent, combo: string): boolean {
  return matchesParsed(event, parseHotkey(combo), isMac());
}

/* -------------------------------------------------------------------------- */
/* Display formatting                                                         */
/* -------------------------------------------------------------------------- */

function formatKeyLabel(key: string, mac: boolean): string {
  if (!key) return "";
  switch (key) {
    case " ":
      return "Space";
    case "escape":
      return "Esc";
    case "enter":
      return mac ? "↵" : "Enter";
    case "arrowup":
      return mac ? "↑" : "Up";
    case "arrowdown":
      return mac ? "↓" : "Down";
    case "arrowleft":
      return mac ? "←" : "Left";
    case "arrowright":
      return mac ? "→" : "Right";
    case "backspace":
      return mac ? "⌫" : "Backspace";
    case "delete":
      return mac ? "⌦" : "Del";
    case "tab":
      return mac ? "⇥" : "Tab";
    default:
      break;
  }
  if (key.length === 1) return key.toUpperCase();
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Formats a combo for display, e.g. mac → `"⌘⇧K"`, non-mac → `"Ctrl+Shift+K"`.
 *
 * Auto-detects the platform when `opts.mac` is omitted.
 *
 * @param combo - The combo string, e.g. `"mod+shift+k"`.
 * @param opts - Optional overrides.
 * @param opts.mac - Force mac (`true`) or non-mac (`false`) rendering.
 * @returns A human-friendly label.
 *
 * @example
 * ```tsx
 * <kbd>{formatHotkey("mod+k")}</kbd>            // "⌘K" on mac, "Ctrl+K" elsewhere
 * formatHotkey("ctrl+shift+k", { mac: false }); // "Ctrl+Shift+K"
 * ```
 */
export function formatHotkey(combo: string, opts: { mac?: boolean } = {}): string {
  const mac = opts.mac ?? isMac();
  const p = parseHotkey(combo);
  const parts: string[] = [];
  if (mac) {
    if (p.meta || p.mod) parts.push("⌘");
    if (p.ctrl) parts.push("⌃");
    if (p.alt) parts.push("⌥");
    if (p.shift) parts.push("⇧");
    parts.push(formatKeyLabel(p.key, true));
    return parts.join("");
  }
  if (p.ctrl || p.mod) parts.push("Ctrl");
  if (p.alt) parts.push("Alt");
  if (p.shift) parts.push("Shift");
  if (p.meta) parts.push("Win");
  parts.push(formatKeyLabel(p.key, false));
  return parts.join("+");
}

/* -------------------------------------------------------------------------- */
/* Scopes (module-level, provider-free)                                       */
/* -------------------------------------------------------------------------- */

const activeScopeSet = new Set<string>();
const scopeListeners = new Set<() => void>();
const EMPTY_SCOPES: readonly string[] = Object.freeze([]);
let scopesSnapshot: string[] = [];

function refreshScopesSnapshot(): void {
  scopesSnapshot = Array.from(activeScopeSet);
}

function emitScopeChange(): void {
  for (const listener of scopeListeners) listener();
}

/**
 * Activates a scope. Hotkeys bound to this scope will start firing.
 *
 * @param name - The scope name.
 *
 * @example
 * ```ts
 * enableScope("editor"); // now editor hotkeys are live
 * ```
 */
export function enableScope(name: string): void {
  if (!activeScopeSet.has(name)) {
    activeScopeSet.add(name);
    refreshScopesSnapshot();
    emitScopeChange();
  }
}

/**
 * Deactivates a scope. Hotkeys bound only to this scope stop firing.
 *
 * @param name - The scope name.
 */
export function disableScope(name: string): void {
  if (activeScopeSet.delete(name)) {
    refreshScopesSnapshot();
    emitScopeChange();
  }
}

/**
 * Toggles a scope on or off.
 *
 * @param name - The scope name.
 */
export function toggleScope(name: string): void {
  if (activeScopeSet.has(name)) disableScope(name);
  else enableScope(name);
}

/** Returns whether a scope is currently active. */
export function isScopeActive(name: string): boolean {
  return activeScopeSet.has(name);
}

function subscribeScopes(callback: () => void): () => void {
  scopeListeners.add(callback);
  return () => {
    scopeListeners.delete(callback);
  };
}

function getScopesSnapshot(): string[] {
  return scopesSnapshot;
}

function getServerScopesSnapshot(): readonly string[] {
  return EMPTY_SCOPES;
}

/**
 * Subscribes to the set of active scopes and exposes controls.
 *
 * The component re-renders whenever scopes change (backed by
 * `useSyncExternalStore`, so it is concurrent-safe and SSR-safe).
 *
 * @returns `{ activeScopes, enableScope, disableScope, toggleScope }`.
 *
 * @example
 * ```tsx
 * function ScopeBadge() {
 *   const { activeScopes, toggleScope } = useHotkeysScopes();
 *   return (
 *     <button onClick={() => toggleScope("editor")}>
 *       {activeScopes.includes("editor") ? "Editor on" : "Editor off"}
 *     </button>
 *   );
 * }
 * ```
 */
export function useHotkeysScopes(): {
  activeScopes: readonly string[];
  enableScope: (name: string) => void;
  disableScope: (name: string) => void;
  toggleScope: (name: string) => void;
} {
  const active = useSyncExternalStore(
    subscribeScopes,
    getScopesSnapshot,
    getServerScopesSnapshot,
  );
  return { activeScopes: active, enableScope, disableScope, toggleScope };
}

/* -------------------------------------------------------------------------- */
/* useHotkeys                                                                 */
/* -------------------------------------------------------------------------- */

const SEQUENCE_TIMEOUT = 1000;

interface HotkeyEntry {
  raw: string;
  steps: ParsedHotkey[];
  isSequence: boolean;
}

interface SequenceProgress {
  index: number;
  time: number;
}

function isModifierKey(key: string): boolean {
  return (
    key === "Control" ||
    key === "Shift" ||
    key === "Alt" ||
    key === "Meta" ||
    key === "OS" ||
    key === "AltGraph"
  );
}

function isFromFormField(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined") return false;
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

function resolveTarget(target: HotkeyTarget | undefined): Window | HTMLElement | null {
  if (typeof window === "undefined") return null;
  if (!target) return window;
  if (target === window) return window;
  if (typeof HTMLElement !== "undefined" && target instanceof HTMLElement) {
    return target;
  }
  return (target as RefObject<HTMLElement | null>).current;
}

function toEntries(keys: string | string[]): HotkeyEntry[] {
  const list = Array.isArray(keys) ? keys : [keys];
  return list.map((raw) => {
    const steps = raw
      .replace(/\s+then\s+/gi, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(parseHotkey);
    return { raw, steps, isSequence: steps.length > 1 };
  });
}

/**
 * Binds keyboard shortcut(s) — combos and/or sequences — for the lifetime of a component.
 *
 * Supports:
 * - **Combos**: `"mod+k"`, `"ctrl+shift+p"`.
 * - **Multiple combos**: pass an array — any match fires the handler.
 * - **Sequences**: `"g then d"` or `"g d"` — press keys in order within ~1s.
 * - **Scopes**: only fire while a named scope is active (see {@link enableScope}).
 *
 * The handler is kept in a ref, so `deps` are optional — the latest closure is
 * always used without re-binding the listener.
 *
 * @param keys - A combo/sequence string, or an array of them.
 * @param handler - Called with the event and the matched combo string.
 * @param options - See {@link HotkeyOptions}.
 * @param deps - Optional dependency list (rarely needed thanks to the latest-ref).
 *
 * @example
 * ```tsx
 * // Open a command palette with ⌘K / Ctrl+K
 * useHotkeys("mod+k", (e) => {
 *   e.preventDefault();
 *   setPaletteOpen(true);
 * });
 *
 * // Navigate with a sequence: press "g" then "d"
 * useHotkeys("g then d", () => router.push("/dashboard"));
 *
 * // Scoped: only while the "editor" scope is active
 * useHotkeys("mod+b", toggleBold, { scopes: "editor" });
 * ```
 */
export function useHotkeys(
  keys: string | string[],
  handler: HotkeyHandler,
  options: HotkeyOptions = {},
  deps?: unknown[],
): void {
  const handlerRef = useRef<HotkeyHandler>(handler);
  handlerRef.current = handler;

  const optionsRef = useRef<HotkeyOptions>(options);
  optionsRef.current = options;

  const entriesRef = useRef<HotkeyEntry[]>([]);
  entriesRef.current = toEntries(keys);

  const progressRef = useRef<Map<string, SequenceProgress>>(new Map());

  const eventType = options.eventType ?? "keydown";
  const depList = deps ?? [];
  const target = options.target;

  useEffect(() => {
    // Re-resolve on every target change so a late-mounting / swapped target
    // re-binds. `target` is in the deps below; resolving inside the effect also
    // keeps the common ref-to-element case working (ref.current is set by the
    // time the effect runs after commit).
    const el = resolveTarget(target);
    if (!el) return;

    const listener = (rawEvent: Event) => {
      const event = rawEvent as KeyboardEvent;
      const o = optionsRef.current;

      if (o.enabled === false) return;

      const enableOnFormTags = o.enableOnFormTags ?? false;
      if (!enableOnFormTags && isFromFormField(event.target)) return;

      const rawScopes = o.scopes;
      const scopeArr =
        rawScopes == null ? [] : Array.isArray(rawScopes) ? rawScopes : [rawScopes];
      if (scopeArr.length > 0 && !scopeArr.some((s) => activeScopeSet.has(s))) {
        return;
      }

      const mac = isMac();
      const preventDefault = o.preventDefault ?? true;
      const lone = isModifierKey(event.key);
      const progress = progressRef.current;

      for (const entry of entriesRef.current) {
        if (entry.isSequence) {
          // Ignore lone modifier presses so they neither advance nor reset.
          if (lone) continue;

          let state = progress.get(entry.raw);
          if (!state) {
            state = { index: 0, time: 0 };
            progress.set(entry.raw, state);
          }

          const now = Date.now();
          if (state.index > 0 && now - state.time > SEQUENCE_TIMEOUT) {
            state.index = 0;
          }

          const expected = entry.steps[state.index];
          if (expected && matchesParsed(event, expected, mac)) {
            state.index += 1;
            state.time = now;
            if (state.index >= entry.steps.length) {
              state.index = 0;
              if (preventDefault) event.preventDefault();
              handlerRef.current(event, entry.raw);
            }
          } else {
            const first = entry.steps[0];
            if (first && matchesParsed(event, first, mac)) {
              state.index = 1;
              state.time = now;
            } else {
              state.index = 0;
            }
          }
        } else {
          const combo = entry.steps[0];
          if (combo && matchesParsed(event, combo, mac)) {
            if (preventDefault) event.preventDefault();
            handlerRef.current(event, entry.raw);
          }
        }
      }
    };

    el.addEventListener(eventType, listener as EventListener);
    return () => {
      el.removeEventListener(eventType, listener as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, eventType, ...depList]);
}
