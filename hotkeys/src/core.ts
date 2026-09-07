/**
 * @lacspace/hotkeys — pure, React-free core.
 *
 * Everything in this module is a plain function over plain data: combo parsing
 * and normalization, event matching, sequence matching (with an injectable
 * clock), scope resolution, an input-ignore predicate, and display formatting.
 * There is **no `react` import here** — the {@link useHotkeys} hook is built on
 * top of these primitives, but they stand entirely on their own (and are the
 * part that is unit-tested directly in a Node environment).
 *
 * @packageDocumentation
 */

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

/**
 * The platform a combo is resolved against. `"mac"` maps `mod` → Cmd/`metaKey`;
 * `"other"` maps `mod` → Ctrl/`ctrlKey`.
 */
export type Platform = "mac" | "other";

/**
 * The minimal shape {@link matchHotkey} needs from a keyboard event. A real
 * DOM `KeyboardEvent` satisfies it, and so does a plain synthetic object
 * `{ key, ctrlKey, metaKey, altKey, shiftKey }` — which is what tests use.
 */
export interface KeyEventLike {
  /** The `event.key` value (e.g. `"k"`, `"Enter"`, `"ArrowUp"`). */
  key: string;
  /** Whether Control was held. @default false */
  ctrlKey?: boolean;
  /** Whether Meta / Cmd / Win was held. @default false */
  metaKey?: boolean;
  /** Whether Alt / Option was held. @default false */
  altKey?: boolean;
  /** Whether Shift was held. @default false */
  shiftKey?: boolean;
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

/**
 * Resolves a {@link Platform}. When `platform` is omitted the current runtime
 * is auto-detected via {@link isMac} (SSR-safe: `"other"` on the server).
 *
 * @param platform - An explicit platform, or `undefined` to auto-detect.
 * @returns `"mac"` or `"other"`.
 */
export function resolvePlatform(platform?: Platform): Platform {
  if (platform) return platform;
  return isMac() ? "mac" : "other";
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

/**
 * Parses a sequence/chord string into an ordered list of combo steps.
 *
 * Steps separate on whitespace or the word `then`, so `"g then d"`, `"g d"` and
 * `"g  then  d"` all parse to `[g, d]`. A single combo (`"mod+k"`) parses to a
 * one-element list. Each step is itself a full combo, so `"ctrl+k then ctrl+w"`
 * works.
 *
 * @param str - The sequence string.
 * @returns One {@link ParsedHotkey} per step, in press order.
 *
 * @example
 * ```ts
 * parseSequence("g then d");   // [{ key: "g", … }, { key: "d", … }]
 * parseSequence("mod+k");      // [{ key: "k", mod: true, … }]
 * ```
 */
export function parseSequence(str: string): ParsedHotkey[] {
  return str
    .replace(/\s+then\s+/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(parseHotkey);
}

/**
 * Whether an `event.key` value is a lone modifier key (`Control`, `Shift`,
 * `Alt`, `Meta`, …) rather than a "real" key. Sequence matching ignores these
 * so that holding a modifier does not advance or reset a chord.
 *
 * @param key - The `event.key` value.
 * @returns `true` for modifier-only keys.
 */
export function isModifierKey(key: string): boolean {
  return (
    key === "Control" ||
    key === "Shift" ||
    key === "Alt" ||
    key === "Meta" ||
    key === "OS" ||
    key === "AltGraph"
  );
}

/* -------------------------------------------------------------------------- */
/* Matching                                                                   */
/* -------------------------------------------------------------------------- */

/** Match a key-event-like object against an already-parsed combo. */
export function matchesParsed(
  event: KeyEventLike,
  parsed: ParsedHotkey,
  mac: boolean,
): boolean {
  const wantMeta = parsed.meta || (mac && parsed.mod);
  const wantCtrl = parsed.ctrl || (!mac && parsed.mod);
  if (!!event.metaKey !== wantMeta) return false;
  if (!!event.ctrlKey !== wantCtrl) return false;
  if (!!event.altKey !== parsed.alt) return false;
  if (!!event.shiftKey !== parsed.shift) return false;
  return event.key.toLowerCase() === parsed.key;
}

/**
 * Returns `true` when a key-event-like object satisfies a combo.
 *
 * Pure and platform-injectable: pass `{ platform }` to resolve `mod` yourself
 * (`"mac"` → `metaKey`, `"other"` → `ctrlKey`); omit it to auto-detect. Modifiers
 * must match exactly, so `"ctrl+k"` does not fire for `Ctrl+Shift+K`.
 *
 * @param combo - A combo string (`"mod+k"`) or an already-parsed combo.
 * @param event - A `KeyboardEvent` or synthetic `{ key, ctrlKey, metaKey, altKey, shiftKey }`.
 * @param opts - Optional `{ platform }` to force `mod` resolution.
 * @returns Whether the event satisfies the combo.
 *
 * @example
 * ```ts
 * matchHotkey("mod+k", { key: "k", metaKey: true }, { platform: "mac" });   // true
 * matchHotkey("mod+k", { key: "k", ctrlKey: true }, { platform: "other" }); // true
 * ```
 */
export function matchHotkey(
  combo: string | ParsedHotkey,
  event: KeyEventLike,
  opts: { platform?: Platform } = {},
): boolean {
  const parsed = typeof combo === "string" ? parseHotkey(combo) : combo;
  return matchesParsed(event, parsed, resolvePlatform(opts.platform) === "mac");
}

/**
 * Returns `true` when a keyboard event satisfies a combo string.
 *
 * `mod` resolves to `metaKey` on mac and `ctrlKey` elsewhere (auto-detected).
 * Modifiers must match exactly (so `"ctrl+k"` does not fire when `Ctrl+Shift+K`
 * is pressed).
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
/* Sequences (pure, injectable clock)                                         */
/* -------------------------------------------------------------------------- */

/** Default rolling window (ms) for a sequence step. */
export const SEQUENCE_TIMEOUT = 1000;

/** Options for {@link createSequenceMatcher}. */
export interface SequenceMatcherOptions {
  /** Rolling window (ms) between steps before the chord resets. @default 1000 */
  timeout?: number;
  /** Platform for `mod` resolution. Omit to auto-detect. */
  platform?: Platform;
}

/** A stateful, side-effect-free sequence matcher (clock is injected per call). */
export interface SequenceMatcher {
  /** The parsed steps, in press order. */
  readonly steps: ParsedHotkey[];
  /**
   * Feed the next key event plus the current time. Returns `true` exactly on
   * the event that completes the whole sequence (and auto-resets); `false`
   * otherwise. Lone modifier presses are ignored (they neither advance nor
   * reset progress).
   */
  handle(event: KeyEventLike, now: number): boolean;
  /** Reset progress to the start. */
  reset(): void;
}

/**
 * Creates a pure sequence matcher for a chord like `"g then d"`.
 *
 * The clock is **injected**: you pass `now` (a millisecond timestamp) into
 * every {@link SequenceMatcher.handle} call, so the matcher never reads
 * `Date.now()` itself and is fully deterministic in tests.
 *
 * @param combo - A sequence string (`"g then d"` / `"g d"`) or pre-parsed steps.
 * @param opts - `{ timeout, platform }`.
 * @returns A {@link SequenceMatcher}.
 *
 * @example
 * ```ts
 * const m = createSequenceMatcher("g then d", { platform: "other", timeout: 1000 });
 * m.handle({ key: "g" }, 0);      // false — first step
 * m.handle({ key: "d" }, 500);    // true  — completed in time
 * m.handle({ key: "g" }, 1000);   // false
 * m.handle({ key: "d" }, 3000);   // false — second step timed out
 * ```
 */
export function createSequenceMatcher(
  combo: string | ParsedHotkey[],
  opts: SequenceMatcherOptions = {},
): SequenceMatcher {
  const steps = typeof combo === "string" ? parseSequence(combo) : combo.slice();
  const timeout = opts.timeout ?? SEQUENCE_TIMEOUT;
  const mac = resolvePlatform(opts.platform) === "mac";
  let index = 0;
  let time = 0;

  return {
    steps,
    reset(): void {
      index = 0;
      time = 0;
    },
    handle(event: KeyEventLike, now: number): boolean {
      if (steps.length === 0) return false;
      // Lone modifier presses neither advance nor reset a chord.
      if (isModifierKey(event.key)) return false;

      if (index > 0 && now - time > timeout) index = 0;

      const expected = steps[index];
      if (expected && matchesParsed(event, expected, mac)) {
        index += 1;
        time = now;
        if (index >= steps.length) {
          index = 0;
          return true;
        }
        return false;
      }

      // No match at the current position: maybe this key restarts the chord.
      const first = steps[0];
      if (first && matchesParsed(event, first, mac)) {
        index = 1;
        time = now;
      } else {
        index = 0;
      }
      return false;
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Scopes (pure resolution)                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Pure scope gate: given the scope requirement(s) of a hotkey and the set of
 * currently-active scopes, returns whether the hotkey should fire.
 *
 * A hotkey with no scopes (`undefined`, `null`, or `[]`) always fires. Otherwise
 * it fires when **at least one** of its scopes is active.
 *
 * @param required - The hotkey's scope(s): a name, a list, or none.
 * @param active - The active scopes (a `Set`, array, or any iterable).
 * @returns Whether the hotkey is allowed to fire.
 *
 * @example
 * ```ts
 * scopesActive(undefined, ["editor"]);        // true  — unscoped, always fires
 * scopesActive("editor", ["editor"]);         // true
 * scopesActive("editor", ["global"]);         // false
 * scopesActive(["a", "b"], new Set(["b"]));   // true  — any-of
 * ```
 */
export function scopesActive(
  required: string | readonly string[] | null | undefined,
  active: Iterable<string>,
): boolean {
  const req = required == null ? [] : Array.isArray(required) ? required : [required as string];
  if (req.length === 0) return true;
  const set = active instanceof Set ? active : new Set(active);
  return req.some((s) => set.has(s));
}

/* -------------------------------------------------------------------------- */
/* Ignore inputs (pure predicate)                                             */
/* -------------------------------------------------------------------------- */

/**
 * The minimal shape {@link shouldIgnore} reads from an event target. A real DOM
 * element satisfies it; tests pass a plain `{ tagName, isContentEditable }`.
 */
export interface IgnoreTargetLike {
  /** The element tag name (e.g. `"INPUT"`), any casing. */
  tagName?: string;
  /** Whether the element is `contentEditable`. */
  isContentEditable?: boolean;
  /** Optional ARIA role (e.g. `"textbox"`), any casing. */
  role?: string | null;
}

/** Options for {@link shouldIgnore}. */
export interface ShouldIgnoreOptions {
  /**
   * When `true`, never ignore — hotkeys fire even inside form fields.
   * @default false
   */
  enableOnFormTags?: boolean;
  /**
   * Tag names (any casing) that count as form fields.
   * @default ["INPUT", "TEXTAREA", "SELECT"]
   */
  ignoreTags?: string[];
  /**
   * Also ignore `contentEditable` elements.
   * @default true
   */
  ignoreContentEditable?: boolean;
  /**
   * ARIA roles (any casing) that also count as editable.
   * @default ["textbox", "searchbox", "combobox"]
   */
  ignoreRoles?: string[];
}

const DEFAULT_IGNORE_TAGS = ["INPUT", "TEXTAREA", "SELECT"];
const DEFAULT_IGNORE_ROLES = ["textbox", "searchbox", "combobox"];

/**
 * Pure predicate: should a hotkey be ignored because focus is in an editable
 * field? Returns `true` when the target is an `input` / `textarea` / `select`,
 * a `contentEditable` element, or an editable ARIA role — all configurable.
 *
 * @param target - A DOM element or a plain `{ tagName, isContentEditable, role }`.
 * @param opts - See {@link ShouldIgnoreOptions}.
 * @returns Whether to ignore the event.
 *
 * @example
 * ```ts
 * shouldIgnore({ tagName: "INPUT" });                       // true
 * shouldIgnore({ tagName: "DIV" });                         // false
 * shouldIgnore({ tagName: "DIV", isContentEditable: true }); // true
 * shouldIgnore({ tagName: "INPUT" }, { enableOnFormTags: true }); // false
 * ```
 */
export function shouldIgnore(
  target: IgnoreTargetLike | null | undefined,
  opts: ShouldIgnoreOptions = {},
): boolean {
  if (opts.enableOnFormTags) return false;
  if (!target) return false;

  const tags = (opts.ignoreTags ?? DEFAULT_IGNORE_TAGS).map((t) => t.toUpperCase());
  const tag = (target.tagName ?? "").toUpperCase();
  if (tag && tags.includes(tag)) return true;

  if ((opts.ignoreContentEditable ?? true) && target.isContentEditable) return true;

  const roles = (opts.ignoreRoles ?? DEFAULT_IGNORE_ROLES).map((r) => r.toLowerCase());
  const role = (target.role ?? "").toLowerCase();
  if (role && roles.includes(role)) return true;

  return false;
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
 * Platform resolution (highest precedence first): explicit `opts.platform`
 * (`"mac"`/`"other"`), then the legacy `opts.mac` boolean, then auto-detection.
 *
 * @param combo - The combo string, e.g. `"mod+shift+k"`.
 * @param opts - Optional overrides.
 * @param opts.mac - Force mac (`true`) or non-mac (`false`) rendering (legacy).
 * @param opts.platform - Force `"mac"` / `"other"` rendering (preferred).
 * @returns A human-friendly label.
 *
 * @example
 * ```tsx
 * formatHotkey("mod+k");                          // "⌘K" on mac, "Ctrl+K" elsewhere
 * formatHotkey("ctrl+shift+k", { mac: false });   // "Ctrl+Shift+K"
 * formatHotkey("mod+shift+k", { platform: "mac" }); // "⌘⇧K"
 * ```
 */
export function formatHotkey(
  combo: string,
  opts: { mac?: boolean; platform?: Platform } = {},
): string {
  const mac =
    opts.platform !== undefined ? opts.platform === "mac" : (opts.mac ?? isMac());
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
