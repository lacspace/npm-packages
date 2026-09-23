/**
 * Shared internals, copied deliberately.
 *
 * These helpers also live in `@lacspace/components`, but this package does not
 * depend on it: a table you can drop into any app without dragging a component
 * library behind it is worth a few duplicated lines. Nothing here touches the
 * DOM at module scope, so every export is safe to import from a server
 * component.
 */
import { useCallback, useId as useReactId, useRef, useState } from "react";

/** Control sizes used across the library. */
export type Size = "sm" | "md" | "lg";

/** Semantic colour intents. `default` inherits the neutral palette. */
export type Tone = "default" | "accent" | "success" | "warning" | "danger" | "info";

/** Horizontal alignment of a column's header, cells and footer. */
export type Align = "start" | "center" | "end";

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
 * A stable id, using React's own `useId` so server and client markup match.
 * Pass an explicit id and that one wins, which is what you want when the id
 * comes from a form library or a label elsewhere on the page.
 */
export function useStableId(explicit?: string, prefix = "lac"): string {
  const generated = useReactId();
  return explicit ?? `${prefix}-${generated.replace(/[:]/g, "")}`;
}

/**
 * One hook for the controlled/uncontrolled pattern every stateful part of a
 * table needs — sort, filters, page, selection, expansion, column widths.
 *
 * Pass `value` and the component follows you; pass only `defaultValue` and it
 * keeps its own state. The setter always fires `onChange`, so a controlled
 * parent hears about every interaction either way.
 */
export function useControllable<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (next: T) => void,
): [T, (next: T) => void] {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState<T>(defaultValue);
  // Keep the latest callback without making `set` change identity every render.
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  const current = isControlled ? (value as T) : internal;

  const set = useCallback(
    (next: T) => {
      if (!isControlled) setInternal(next);
      changeRef.current?.(next);
    },
    [isControlled],
  );

  return [current, set];
}

/**
 * Clamp a number into a range. Returns `min` when the range is inverted, which
 * keeps a mis-specified column width from rendering something nonsensical.
 */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (max < min) return min;
  return value < min ? min : value > max ? max : value;
}
