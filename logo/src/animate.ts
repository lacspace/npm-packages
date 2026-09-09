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

  const style =
    `<style>` +
    `@keyframes lac-in{0%{opacity:0;transform:scale(.9)}60%{opacity:1}100%{opacity:1;transform:scale(1)}}` +
    `@keyframes lac-wipe{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}` +
    `@keyframes lac-shim{0%{transform:translateX(${(-w * 0.6).toFixed(0)}px) skewX(-16deg)}` +
    `55%{transform:translateX(${(w * 1.2).toFixed(0)}px) skewX(-16deg)}` +
    `100%{transform:translateX(${(w * 1.2).toFixed(0)}px) skewX(-16deg)}}` +
    `.lac-root{transform-origin:50% 50%;` +
    `animation:lac-in ${dur}ms cubic-bezier(.2,.75,.2,1) ${iter} both,` +
    `lac-wipe ${Math.round(dur * 0.7)}ms cubic-bezier(.4,0,.2,1) ${iter} both}` +
    `.lac-shim{animation:lac-shim ${Math.round(dur * 1.25)}ms ease ${iter} both;mix-blend-mode:overlay}` +
    `@media(prefers-reduced-motion:reduce){.lac-root{animation:none;clip-path:none}.lac-shim{display:none}}` +
    `</style>`;

  const shimDefs = shimmer
    ? `<linearGradient id="lac-shim-g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
    : "";
  const shimRect = shimmer
    ? `<rect class="lac-shim" x="0" y="0" width="${(w * 0.4).toFixed(0)}" height="${h}" fill="url(#lac-shim-g)"/>`
    : "";

  // Tag the root <svg> so the CSS can target it, inject the style + shimmer defs
  // right after the opening tag, and append the shimmer rect before </svg>.
  let svg = result.svg.replace(/^<svg /, `<svg class="lac-root" `);
  svg = svg.replace(/(<svg\b[^>]*>)/, `$1${style}<defs>${shimDefs}</defs>`);
  svg = svg.replace(/<\/svg>\s*$/, `${shimRect}</svg>`);
  return svg;
}
