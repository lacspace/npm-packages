/**
 * @lacspace/ui — pure core
 *
 * Framework-agnostic building blocks that power the components: a class-value
 * joiner, easing math, a numeric counter formatter, gradient/tilt CSS builders,
 * roving-index navigation math, a command filter/scorer, a typewriter state
 * machine, deterministic ids and stagger timing.
 *
 * Nothing here imports React — every function is a plain, synchronous,
 * SSR-safe utility. Components consume these so they can stay thin, and you can
 * reuse them directly (e.g. to drive your own animations or hotkey lists).
 */

/* ------------------------------------------------------------------ *
 * Class names
 * ------------------------------------------------------------------ */

export type ClassValue = string | number | false | null | undefined;

/**
 * Join class values, dropping falsy ones. Like `cn`, but also accepts numbers
 * (handy for conditional `` `col-${n}` `` fragments).
 *
 * @example cx("btn", isActive && "btn--on", 0, "px-4") // "btn px-4"
 */
export function cx(...parts: ClassValue[]): string {
  let out = "";
  for (const p of parts) {
    if (!p && p !== 0) continue;
    if (p === 0) continue;
    out = out ? `${out} ${p}` : `${p}`;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Number math
 * ------------------------------------------------------------------ */

/** Constrain `n` to the inclusive range `[min, max]`. */
export function clamp(n: number, min: number, max: number): number {
  return n < min ? min : n > max ? max : n;
}

/** Linear interpolation between `a` and `b` by `t` (t is not clamped). */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Re-map `n` from `[inMin,inMax]` onto `[outMin,outMax]`. */
export function mapRange(
  n: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (inMax === inMin) return outMin;
  return outMin + ((n - inMin) * (outMax - outMin)) / (inMax - inMin);
}

/* ------------------------------------------------------------------ *
 * Easing
 * ------------------------------------------------------------------ */

export type EasingName =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "easeInCubic"
  | "easeOutCubic"
  | "easeOutBack";

/** Named easing functions mapping progress `t ∈ [0,1]` to eased `[0,1]`. */
export const easings: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeOutBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

/** Apply a named easing to `t`, clamping `t` into `[0,1]` first. */
export function ease(name: EasingName, t: number): number {
  const fn = easings[name] ?? easings.linear;
  return fn(clamp(t, 0, 1));
}

/* ------------------------------------------------------------------ *
 * Counter formatting (powers <Counter>)
 * ------------------------------------------------------------------ */

export interface FormatCountOptions {
  /** Fixed decimal places. Default 0. */
  decimals?: number;
  /** Group thousands with commas. Default true. */
  separator?: boolean;
  prefix?: string;
  suffix?: string;
}

/**
 * Format a numeric value the way `<Counter>` displays it: fixed decimals,
 * optional thousands grouping, and prefix/suffix.
 *
 * @example formatCount(12480, { suffix: "+" }) // "12,480+"
 */
export function formatCount(value: number, opts: FormatCountOptions = {}): string {
  const { decimals = 0, separator = true, prefix = "", suffix = "" } = opts;
  const num = value.toFixed(decimals);
  const [int, frac] = num.split(".");
  const grouped = separator ? int!.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : int;
  return `${prefix}${grouped}${frac ? "." + frac : ""}${suffix}`;
}

/* ------------------------------------------------------------------ *
 * Gradient / tilt CSS builders
 * ------------------------------------------------------------------ */

/** Build a `linear-gradient(...)` CSS string (powers `<GradientText>`). */
export function linearGradient(from: string, to: string, angle = 135): string {
  return `linear-gradient(${angle}deg, ${from}, ${to})`;
}

export interface TiltOptions {
  /** Horizontal pointer offset from centre, fraction in `[-0.5, 0.5]`. */
  px: number;
  /** Vertical pointer offset from centre, fraction in `[-0.5, 0.5]`. */
  py: number;
  /** Max tilt in degrees. Default 8. */
  max?: number;
  /** Scale factor. Default 1.02. */
  scale?: number;
  /** Perspective in px. Default 900. */
  perspective?: number;
}

/**
 * Compute the 3D `transform` string a `<TiltCard>` applies for a given pointer
 * position (fractions from centre). Positive `px` tilts right, positive `py`
 * tilts down.
 */
export function tiltTransform({ px, py, max = 8, scale = 1.02, perspective = 900 }: TiltOptions): string {
  return `perspective(${perspective}px) rotateY(${px * max}deg) rotateX(${-py * max}deg) scale(${scale})`;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Convert a pointer position within a rectangle to centre-relative fractions
 * in `[-0.5, 0.5]`, ready to feed into {@link tiltTransform}.
 */
export function pointerFraction(rect: Rect, clientX: number, clientY: number): { px: number; py: number } {
  const px = rect.width ? (clientX - rect.left) / rect.width - 0.5 : 0;
  const py = rect.height ? (clientY - rect.top) / rect.height - 0.5 : 0;
  return { px, py };
}

/* ------------------------------------------------------------------ *
 * Roving / arrow-key navigation (powers <CommandPalette>)
 * ------------------------------------------------------------------ */

/**
 * Next selected index after moving by `delta`. Clamps to `[0, length-1]` by
 * default; set `loop` to wrap around the ends. Returns 0 for an empty list.
 */
export function nextIndex(current: number, delta: number, length: number, opts: { loop?: boolean } = {}): number {
  if (length <= 0) return 0;
  const raw = current + delta;
  if (opts.loop) return ((raw % length) + length) % length;
  return clamp(raw, 0, length - 1);
}

/* ------------------------------------------------------------------ *
 * Command filtering / scoring (powers <CommandPalette>)
 * ------------------------------------------------------------------ */

/**
 * Score how well `query` matches `text`. Returns 0 for no match, otherwise a
 * positive number where higher is better (exact > prefix > substring >
 * in-order subsequence). Case-insensitive.
 */
export function scoreMatch(text: string, query: string): number {
  const t = text.toLowerCase();
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  if (t === q) return 100;
  const idx = t.indexOf(q);
  if (idx === 0) return 80;
  if (idx > 0) return 60 - Math.min(idx, 20);
  // in-order subsequence fallback
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length ? 20 : 0;
}

/**
 * Filter items by a query (case-insensitive substring across the searchable
 * text). Empty/blank query returns the list unchanged. Mirrors how
 * `<CommandPalette>` narrows its list.
 */
export function filterCommands<T>(items: T[], query: string, key: (item: T) => string = String): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => key(i).toLowerCase().includes(q));
}

/**
 * Filter *and* rank items by relevance using {@link scoreMatch}, dropping
 * non-matches. Stable for equal scores. Empty query returns the list unchanged.
 */
export function rankCommands<T>(items: T[], query: string, key: (item: T) => string = String): T[] {
  const q = query.trim();
  if (!q) return items;
  return items
    .map((item, i) => ({ item, i, s: scoreMatch(key(item), q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.item);
}

/* ------------------------------------------------------------------ *
 * Typewriter state machine (framework-agnostic)
 * ------------------------------------------------------------------ */

export interface TypewriterState {
  /** Text currently shown. */
  text: string;
  /** Index of the word being typed/deleted. */
  wordIndex: number;
  /** True while deleting characters. */
  deleting: boolean;
}

export interface TypewriterTiming {
  /** Ms per typed character. Default 70. */
  typeSpeed?: number;
  /** Ms per deleted character. Default 40. */
  deleteSpeed?: number;
  /** Ms to hold a fully-typed word. Default 1400. */
  hold?: number;
}

/**
 * Advance a typewriter one tick. Pure: given the current `state` and the word
 * list, returns the next `state` and the `delay` (ms) to wait before the tick
 * after it. Cycles words forever; safe on an empty list.
 */
export function typewriterStep(
  words: string[],
  state: TypewriterState,
  timing: TypewriterTiming = {},
): { state: TypewriterState; delay: number } {
  const { typeSpeed = 70, deleteSpeed = 40, hold = 1400 } = timing;
  if (words.length === 0) return { state: { text: "", wordIndex: 0, deleting: false }, delay: hold };

  const { text, wordIndex, deleting } = state;
  const current = words[wordIndex % words.length]!;

  if (!deleting) {
    if (text === current) {
      // Fully typed — hold, then begin deleting.
      return { state: { text, wordIndex, deleting: true }, delay: hold };
    }
    const next = current.slice(0, text.length + 1);
    return { state: { text: next, wordIndex, deleting: false }, delay: typeSpeed };
  }

  if (text === "") {
    // Fully deleted — advance to the next word.
    return { state: { text: "", wordIndex: (wordIndex + 1) % words.length, deleting: false }, delay: typeSpeed };
  }
  return { state: { text: text.slice(0, -1), wordIndex, deleting: true }, delay: deleteSpeed };
}

/* ------------------------------------------------------------------ *
 * Ids & timing
 * ------------------------------------------------------------------ */

/**
 * Create a deterministic id generator seeded by an LCG — stable across SSR and
 * client for a given call order, so it avoids hydration mismatches on wrappers.
 */
export function createUid(prefix = "lac"): () => string {
  let seed = 1;
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return `${prefix}-${seed.toString(36)}`;
  };
}

/**
 * Delay (seconds) for the `index`-th item in a staggered sequence.
 *
 * @example stagger(3, 0.08) // 0.24
 */
export function stagger(index: number, step = 0.08, base = 0): number {
  return base + Math.max(0, index) * step;
}
