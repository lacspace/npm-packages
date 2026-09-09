/**
 * animateLogo — turn any generated logo into a self-contained *animated* SVG
 * that "crafts itself" on load: it wipes/scales in and a light shimmer sweeps
 * across the mark. Pure CSS keyframes embedded in the SVG — no JS, works in any
 * browser, README or site. Deterministic; respects prefers-reduced-motion.
 */
import { generateLogo } from "./generate.js";
import type { LogoBrief, LogoResult } from "./types.js";

export interface AnimateOptions {
  /** Total reveal duration in ms (default 1500). */
  duration?: number;
  /** Loop forever instead of playing once (default false). */
  loop?: boolean;
  /** Add the sweeping shimmer highlight (default true). */
  shimmer?: boolean;
}

/** Wrap a logo (a LogoResult or a brief) in an embedded CSS reveal animation. */
export function animateLogo(input: LogoResult | LogoBrief, opts: AnimateOptions = {}): string {
  const result = "svg" in input ? (input as LogoResult) : generateLogo(input as LogoBrief);
  const w = result.width;
  const h = result.height;
  const dur = opts.duration ?? 1500;
  const iter = opts.loop ? "infinite" : "1";
  const shimmer = opts.shimmer !== false;

  // The reveal animates an INNER <g> (not the root <svg>): transform + opacity on
  // a group are reliable everywhere, and the logo is drawn at rest (visible) with
  // `both` fill so it never gets stuck invisible if the animation can't run. The
  // shimmer is clipped to the mark's own bounding box so it lights the logo, not
  // the empty canvas around it.
  const style =
    `<style>` +
    `@keyframes lac-in{0%{opacity:0;transform:translateY(${Math.round(h * 0.03)}px) scale(.9)}55%{opacity:1}100%{opacity:1;transform:none}}` +
    `@keyframes lac-shim{0%{transform:translateX(${(-w * 0.55).toFixed(0)}px) skewX(-14deg)}` +
    `50%,100%{transform:translateX(${(w * 1.15).toFixed(0)}px) skewX(-14deg)}}` +
    `.lac-in{transform-box:fill-box;transform-origin:center;` +
    `animation:lac-in ${dur}ms cubic-bezier(.2,.8,.2,1) ${iter} both}` +
    `.lac-shim{transform-box:fill-box;transform-origin:center;opacity:.9;mix-blend-mode:overlay;` +
    `animation:lac-shim ${Math.round(dur * 1.2)}ms ease ${Math.round(dur * 0.35)}ms ${iter} both}` +
    `@media(prefers-reduced-motion:reduce){.lac-in{animation:none;opacity:1;transform:none}.lac-shim{display:none}}` +
    `</style>`;

  const shimDefs = shimmer
    ? `<linearGradient id="lac-shim-g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
    : "";
  const shimRect = shimmer
    ? `<rect class="lac-shim" x="0" y="0" width="${(w * 0.4).toFixed(0)}" height="${h}" fill="url(#lac-shim-g)"/>`
    : "";

  // Inject the style + shimmer defs right after the opening <svg>, wrap the whole
  // logo body in an animated <g class="lac-in">, and drop the shimmer sweep on top.
  let svg = result.svg.replace(/(<svg\b[^>]*>)/, `$1${style}<defs>${shimDefs}</defs><g class="lac-in">`);
  svg = svg.replace(/<\/svg>\s*$/, `</g>${shimRect}</svg>`);
  return svg;
}
