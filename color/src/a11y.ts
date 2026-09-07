/**
 * WCAG 2.1 accessibility helpers layered on the core `contrast` primitive.
 * Zero-dep, isomorphic.
 */

import { contrast, type RGBA } from "./index";

/** WCAG contrast ratio between two colours (1–21). Alias of `contrast`. */
export const contrastRatio = contrast;

/** WCAG conformance level for a contrast ratio. */
export type WcagLevel = "AAA" | "AA" | "fail";

/**
 * Classify a contrast ratio against WCAG 2.1 text thresholds.
 * Normal text: AA ≥ 4.5, AAA ≥ 7. Large text (`{ large: true }`): AA ≥ 3, AAA ≥ 4.5.
 */
export function wcagLevel(ratio: number, opts: { large?: boolean } = {}): WcagLevel {
  const aaa = opts.large ? 4.5 : 7;
  const aa = opts.large ? 3 : 4.5;
  if (ratio >= aaa) return "AAA";
  if (ratio >= aa) return "AA";
  return "fail";
}

/**
 * Pick the most readable text colour for `background` from a set of candidates
 * (defaults to black & white). Returns the candidate with the highest contrast.
 */
export function bestTextColor(
  background: RGBA | string,
  candidates: readonly (RGBA | string)[] = ["#000000", "#ffffff"],
): RGBA | string {
  if (candidates.length === 0) throw new Error("bestTextColor: candidates must not be empty");
  let best = candidates[0]!;
  let bestRatio = -1;
  for (const c of candidates) {
    const ratio = contrast(background, c);
    if (ratio > bestRatio) { bestRatio = ratio; best = c; }
  }
  return best;
}
