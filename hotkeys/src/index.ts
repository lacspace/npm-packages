/**
 * @lacspace/hotkeys — ergonomic keyboard shortcuts for React.
 *
 * Combos (`mod+k`), key sequences (`g then d`), scopes, and pretty display
 * formatting (`⌘K`). SSR-safe, respects form fields, zero-dependency, fully typed.
 *
 * The matching engine lives in {@link ./core} as pure, React-free functions
 * (`parseHotkey`, `matchHotkey`, `createSequenceMatcher`, `scopesActive`,
 * `shouldIgnore`, `formatHotkey`); {@link useHotkeys} and {@link useHotkeysScopes}
 * are the React bindings on top.
 *
 * @packageDocumentation
 */

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { RefObject } from "react";

import {
  isMac,
  isModifierKey,
  matchesParsed,
  parseSequence,
  scopesActive,
} from "./core";
import type { ParsedHotkey } from "./core";

/* -------------------------------------------------------------------------- */
/* Re-exported pure core (React-free)                                         */
/* -------------------------------------------------------------------------- */

export {
  isMac,
  parseHotkey,
  parseSequence,
  matchesHotkey,
  matchHotkey,
  createSequenceMatcher,
  scopesActive,
  shouldIgnore,
  resolvePlatform,
  isModifierKey,
  formatHotkey,
} from "./core";
export type {
  ParsedHotkey,
  Platform,
  KeyEventLike,
  SequenceMatcher,
  SequenceMatcherOptions,
  IgnoreTargetLike,
  ShouldIgnoreOptions,
} from "./core";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

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
/* Form-field guard (DOM)                                                     */
/* -------------------------------------------------------------------------- */

function isFromFormField(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined") return false;
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
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
    const steps = parseSequence(raw);
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

      if (!scopesActive(o.scopes, activeScopeSet)) {
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
