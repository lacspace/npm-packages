/**
 * Shared internals, copied deliberately rather than imported.
 *
 * `@lacspace/charts` has no dependency on `@lacspace/components` — it is a
 * standalone package with React as its only peer — so the handful of helpers
 * both libraries need live here too. They are identical on purpose: the class
 * names, the `lac` base class and the `--lac-*` tokens are the same, so the two
 * packages look like one library when they sit on the same page.
 *
 * Nothing here touches the DOM at module scope, so every component in this
 * package is safe to import from a server component.
 */
import { useId as useReactId } from "react";

/** Control sizes used across the Lacspace libraries. */
export type Size = "sm" | "md" | "lg";

/** Semantic colour intents. `default` inherits the neutral palette. */
export type Tone = "default" | "accent" | "success" | "warning" | "danger" | "info";

/**
 * Join class names, dropping anything falsy. Deliberately tiny — the whole
 * point of this package is that it adds no dependency to your bundle.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  let out = "";
  for (const part of parts) {
    if (!part) continue;
    out = out ? `${out} ${part}` : part;
  }
  return out;
}

/**
 * Merge the library's own class list with whatever the caller passed. The
 * caller's className always comes last so their rules win at equal specificity
 * — overriding a style should never require `!important`.
 */
export function classes(base: string, extra?: string): string {
  return cx("lac", base, extra);
}

/**
 * Clamp a number into a range. Returns `min` when the range is inverted or the
 * value is not finite, which keeps one bad datum from drawing a chart off into
 * the void.
 */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (max < min) return min;
  return value < min ? min : value > max ? max : value;
}

/** Percentage of `value` through `min..max`, clamped to 0-100. */
export function percent(value: number, min = 0, max = 100): number {
  if (max === min) return 0;
  return clamp(((value - min) / (max - min)) * 100, 0, 100);
}

/**
 * A stable id, using React's own `useId` so server and client markup match.
 * Charts need this for gradient and clip-path ids — two charts on one page must
 * not share a `<linearGradient id>` or the second one repaints the first.
 */
export function useStableId(explicit?: string, prefix = "lac"): string {
  const generated = useReactId();
  return explicit ?? `${prefix}-${generated.replace(/[:]/g, "")}`;
}
