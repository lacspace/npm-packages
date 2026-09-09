/**
 * Animated Lacspace marks as self-contained SVG strings — pure CSS, zero JS, drop
 * straight into any page, README, email or app. Every animation carries its own
 * `<style>` and honours `prefers-reduced-motion`.
 *
 *  - `craftMark()`   the signature hero reveal: the neural network builds itself
 *                    node-by-node, the wires fire signal pulses, then the mark
 *                    blooms in from the centre and breathes. (The one on
 *                    developer.lacspace.com.)
 *  - `pulseMark()`   a calm breathing loop (splash screens, loaders, favicons).
 *  - `floatMark()`   a gentle vertical bob.
 *  - `shimmerMark()` a single diagonal light sweep across the mark.
 *  - `revealMark()`  a one-shot scale-in intro.
 */

import { VIEWBOX, MARK_PATH, NODES, EDGES, craftOrder } from "./geometry.js";
import { HEX, MARK_GRADIENT } from "./colors.js";
import { ARTWORK_INNER } from "./artwork.js";

export interface AnimateOptions {
  /** px size (square). Default 320. */
  size?: number;
  /** Loop after the intro (adds an idle spark cadence for `craftMark`). Default false. */
  loop?: boolean;
  /** Background: `transparent` (default), `ink`, `off-white`, any CSS colour. */
  background?: "transparent" | "ink" | "off-white" | (string & {});
  /** Disambiguate ids/keyframes when embedding several inline. Default random-free per fn. */
  uid?: string;
}

function grad(id: string): string {
  const stops = MARK_GRADIENT.map((s) => `<stop offset="${s.offset * 100}%" stop-color="${s.color}"/>`).join("");
  return `<linearGradient id="${id}" x1="0%" y1="0%" x2="100%" y2="100%">${stops}</linearGradient>`;
}

function ground(background: AnimateOptions["background"]): string {
  const c = !background || background === "transparent" ? null : background === "ink" ? HEX.ink : background === "off-white" ? HEX.offWhite : background;
  return c ? `<rect width="${VIEWBOX}" height="${VIEWBOX}" fill="${c}"/>` : "";
}

function svgOpen(size: number, label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" role="img" aria-label="${label}"><title>${label}</title>`;
}

// ── the signature self-crafting reveal ──────────────────────────────────────
const T = {
  dotStagger: 90, dotDur: 360, dotsPause: 200,
  outlineDelay: 550, outlineDur: 1650,
  lineDur: 460, lineStep: 100, sparkDur: 440,
  preIgnite: 150, igniteDur: 640, rippleAfter: 140, rippleDur: 620,
};

export function craftMark(opts: AnimateOptions = {}): string {
  const { size = 320, loop = false, background = "transparent", uid = "c" } = opts;
  const { birth, edges } = craftOrder();
  const g = `lac-${uid}`;

  const DOTS_END = (NODES.length - 1) * T.dotStagger + T.dotDur;
  const CONN_START = DOTS_END + T.dotsPause;
  const CONN_END = CONN_START + (EDGES.length - 1) * T.lineStep + T.lineDur;
  const IGNITE_DELAY = CONN_END + T.preIgnite;
  const RIPPLE_DELAY = IGNITE_DELAY + T.rippleAfter;
  const CRAFTOUT = RIPPLE_DELAY + 200;
  const BREATHE = RIPPLE_DELAY + T.rippleDur + 120;
  const edgeDelay = (i: number) => CONN_START + i * T.lineStep;

  const css = `
.${g}-outline{fill:none;stroke:url(#${g}-grad);stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1;opacity:0;animation:${g}-draw ${T.outlineDur}ms cubic-bezier(.65,0,.35,1) ${T.outlineDelay}ms forwards}
.${g}-edge{stroke:url(#${g}-grad);stroke-width:1.7;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1;opacity:0;animation:${g}-draw ${T.lineDur}ms cubic-bezier(.22,.61,.36,1) forwards var(--d)}
.${g}-pulse{stroke:#d6fbff;stroke-width:3;stroke-linecap:round;stroke-dasharray:.15 1;stroke-dashoffset:.15;opacity:0;animation:${g}-signal ${T.sparkDur}ms cubic-bezier(.5,0,.5,1) forwards var(--d)}
.${g}-node{fill:url(#${g}-grad);opacity:0;transform:scale(0);transform-box:fill-box;transform-origin:center;animation:${g}-pop ${T.dotDur}ms cubic-bezier(.34,1.35,.64,1) forwards var(--d)}
.${g}-glow{fill:rgba(96,190,255,.55);opacity:0;transform:scale(.2);transform-box:fill-box;transform-origin:center;animation:${g}-glow 820ms ease-out forwards var(--d)}
.${g}-craft{animation:${g}-craftout 500ms ease ${CRAFTOUT}ms forwards}
.${g}-final{opacity:0;transform-box:fill-box;transform-origin:center;animation:${g}-bloom ${T.rippleDur}ms cubic-bezier(.34,1.2,.64,1) ${RIPPLE_DELAY}ms forwards${loop ? `,${g}-breathe 3.6s ease-in-out ${BREATHE + 400}ms infinite` : `,${g}-breathe 3.6s ease-in-out ${BREATHE}ms 1`}}
.${g}-ignite{fill:rgba(214,251,255,.9);opacity:0;transform:scale(.4);transform-box:fill-box;transform-origin:center;animation:${g}-ignite ${T.igniteDur}ms ease-out ${IGNITE_DELAY}ms forwards}
@keyframes ${g}-draw{to{stroke-dashoffset:0;opacity:1}from{stroke-dashoffset:1;opacity:1}}
@keyframes ${g}-signal{0%{stroke-dashoffset:.15;opacity:0}15%{opacity:1}85%{opacity:1}100%{stroke-dashoffset:-1;opacity:0}}
@keyframes ${g}-pop{from{opacity:0;transform:scale(0)}70%{opacity:1}to{opacity:1;transform:scale(1)}}
@keyframes ${g}-glow{0%{opacity:0;transform:scale(.2)}35%{opacity:.9}100%{opacity:0;transform:scale(1.5)}}
@keyframes ${g}-craftout{to{opacity:0}}
@keyframes ${g}-ignite{0%{opacity:0;transform:scale(.4)}28%{opacity:1;transform:scale(1.15)}100%{opacity:0;transform:scale(2.9)}}
@keyframes ${g}-bloom{0%{opacity:0;transform:scale(.42)}55%{opacity:1}100%{opacity:1;transform:scale(1)}}
@keyframes ${g}-breathe{50%{transform:scale(.978)}}
@media (prefers-reduced-motion:reduce){.${g}-outline,.${g}-edge,.${g}-pulse,.${g}-node,.${g}-glow,.${g}-craft{animation:none;opacity:0}.${g}-final{animation:none;opacity:1;transform:none}}`;

  const edgesSvg = edges.map(([a, b], i) => `<line class="${g}-edge" x1="${NODES[a]![0]}" y1="${NODES[a]![1]}" x2="${NODES[b]![0]}" y2="${NODES[b]![1]}" pathLength="1" style="--d:${edgeDelay(i)}ms"/>`).join("");
  const pulsesSvg = edges.map(([a, b], i) => `<line class="${g}-pulse" x1="${NODES[a]![0]}" y1="${NODES[a]![1]}" x2="${NODES[b]![0]}" y2="${NODES[b]![1]}" pathLength="1" style="--d:${edgeDelay(i) + T.lineDur}ms"/>`).join("");
  const nodesSvg = NODES.map(([x, y], i) => `<g style="--d:${birth[i]! * T.dotStagger}ms"><circle class="${g}-glow" cx="${x}" cy="${y}" r="7.2"/><circle class="${g}-node" cx="${x}" cy="${y}" r="3.7"/></g>`).join("");

  return (
    svgOpen(size, "Lacspace") +
    `<defs>${grad(`${g}-grad`)}</defs><style>${css}</style>` +
    ground(background) +
    `<g class="${g}-craft">` +
    `<path class="${g}-outline" d="${MARK_PATH}" pathLength="1"/>` +
    `<g>${edgesSvg}</g><g>${pulsesSvg}</g><g>${nodesSvg}</g>` +
    `<circle class="${g}-ignite" cx="${NODES[7]![0]}" cy="${NODES[7]![1]}" r="5.2"/>` +
    `</g>` +
    `<g class="${g}-final">${ARTWORK_INNER}</g>` +
    `</svg>`
  );
}

// ── simple loops ────────────────────────────────────────────────────────────
// The simple loops animate the real, professional artwork.
function baseMark(_g: string): string {
  return ARTWORK_INNER;
}

export function pulseMark(opts: AnimateOptions = {}): string {
  const { size = 320, background = "transparent", uid = "p" } = opts;
  const g = `lac-${uid}`;
  const css = `.${g}-m{transform-box:fill-box;transform-origin:center;animation:${g}-b 3.2s ease-in-out infinite;filter:drop-shadow(0 6px 20px rgba(59,130,246,.35))}@keyframes ${g}-b{0%,100%{transform:scale(1)}50%{transform:scale(1.045)}}@media (prefers-reduced-motion:reduce){.${g}-m{animation:none}}`;
  return svgOpen(size, "Lacspace") + `<defs>${grad(`${g}-grad`)}</defs><style>${css}</style>` + ground(background) + `<g class="${g}-m">${baseMark(g)}</g></svg>`;
}

export function floatMark(opts: AnimateOptions = {}): string {
  const { size = 320, background = "transparent", uid = "f" } = opts;
  const g = `lac-${uid}`;
  const css = `.${g}-m{transform-box:fill-box;transform-origin:center;animation:${g}-f 4s ease-in-out infinite}@keyframes ${g}-f{0%,100%{transform:translateY(-3px)}50%{transform:translateY(3px)}}@media (prefers-reduced-motion:reduce){.${g}-m{animation:none}}`;
  return svgOpen(size, "Lacspace") + `<defs>${grad(`${g}-grad`)}</defs><style>${css}</style>` + ground(background) + `<g class="${g}-m">${baseMark(g)}</g></svg>`;
}

export function revealMark(opts: AnimateOptions = {}): string {
  const { size = 320, background = "transparent", uid = "r" } = opts;
  const g = `lac-${uid}`;
  const css = `.${g}-m{transform-box:fill-box;transform-origin:center;opacity:0;animation:${g}-r 900ms cubic-bezier(.34,1.3,.64,1) forwards}@keyframes ${g}-r{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}@media (prefers-reduced-motion:reduce){.${g}-m{animation:none;opacity:1}}`;
  return svgOpen(size, "Lacspace") + `<defs>${grad(`${g}-grad`)}</defs><style>${css}</style>` + ground(background) + `<g class="${g}-m">${baseMark(g)}</g></svg>`;
}

export function shimmerMark(opts: AnimateOptions = {}): string {
  const { size = 320, background = "transparent", uid = "s" } = opts;
  const g = `lac-${uid}`;
  const css = `.${g}-sweep{opacity:.9;mix-blend-mode:overlay;animation:${g}-sw 2.6s ease-in-out infinite}@keyframes ${g}-sw{0%{transform:translateX(-60%) skewX(-12deg)}60%,100%{transform:translateX(320%) skewX(-12deg)}}@media (prefers-reduced-motion:reduce){.${g}-sweep{animation:none;opacity:0}}`;
  return (
    svgOpen(size, "Lacspace") +
    `<defs>${grad(`${g}-grad`)}<clipPath id="${g}-clip"><path d="${MARK_PATH}"/></clipPath>` +
    `<linearGradient id="${g}-sh" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>` +
    `<style>${css}</style>` + ground(background) +
    `<g clip-path="url(#${g}-clip)">${baseMark(g)}<rect class="${g}-sweep" x="-40" y="-40" width="90" height="360" fill="url(#${g}-sh)"/></g></svg>`
  );
}

export type AnimationName = "craft" | "pulse" | "float" | "reveal" | "shimmer";

/** Render any animation by name. */
export function animatedMark(name: AnimationName, opts: AnimateOptions = {}): string {
  switch (name) {
    case "craft": return craftMark(opts);
    case "pulse": return pulseMark(opts);
    case "float": return floatMark(opts);
    case "reveal": return revealMark(opts);
    case "shimmer": return shimmerMark(opts);
  }
}
