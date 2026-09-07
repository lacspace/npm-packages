/**
 * @lacspace/og — extra templates, themes, image embedding & auto text-fit.
 *
 * New in 1.2.0. Everything here is **additive** and backward compatible — the
 * existing {@link ogCard}, {@link ogSvg}, {@link ogSvgDataUri} and
 * {@link fitFontSize} are untouched.
 *
 * Two kinds of new API live here:
 *
 * 1. A **zero-dependency SVG template renderer** — {@link ogTemplateSvg} /
 *    {@link ogTemplateSvgDataUri} — that renders *any* of seven named layouts
 *    (`classic`, `minimal`, `split`, `article`, `product`, `quote`, `event`)
 *    to a standalone SVG string with named gradients/surfaces, image or
 *    initials logo marks, background patterns, accent bars and an
 *    auto-shrinking, multi-line title. No browser, no Satori, edge-safe.
 * 2. Two more **`next/og` element-tree** layouts — {@link ogQuote} and
 *    {@link ogEvent} — matching the shape the other `ogCard*` functions return.
 *
 * ```ts
 * import { ogTemplateSvg } from "@lacspace/og";
 * const svg = ogTemplateSvg({
 *   template: "article",
 *   title: "How we cut cold starts in half",
 *   eyebrow: "Engineering",
 *   author: "Ada Lovelace",
 *   date: "Sep 7, 2026",
 *   gradient: "aurora",
 *   image: "data:image/png;base64,iVBORw0KG…",
 * });
 * ```
 */

import { fitFontSize, ogThemes, type OgNode, type OgOptions, type OgStyle, type OgTheme } from "./index";

/* ------------------------------------------------------------------ *
 * Named gradient presets (superset of ogThemes) + surface palettes
 * ------------------------------------------------------------------ */

/**
 * Named gradient presets — a **superset** of {@link ogThemes} with more
 * options. Pass a name via `gradient` on any template; explicit `from`/`to`
 * always win. Includes every {@link ogThemes} name plus a wider palette.
 */
export const ogGradients = {
  ...ogThemes,
  midnight: { from: "#3b82f6", to: "#0f172a" },
  aurora: { from: "#34d399", to: "#3b82f6" },
  ember: { from: "#f97316", to: "#7c2d12" },
  gold: { from: "#fbbf24", to: "#b45309" },
  rose: { from: "#fb7185", to: "#be123c" },
  mint: { from: "#6ee7b7", to: "#059669" },
  cosmos: { from: "#8b5cf6", to: "#1e1b4b" },
  candy: { from: "#f472b6", to: "#8b5cf6" },
  mono: { from: "#e5e7eb", to: "#6b7280" },
} as const;

export type OgGradientName = keyof typeof ogGradients;

/**
 * Named **surface** palettes — full ground/foreground colour sets for the card
 * body (as opposed to the accent gradient). Pass a name via `surface`.
 */
export const ogSurfaces = {
  ink: { bg: "#0a0a0f", fg: "#ffffff", muted: "rgba(255,255,255,0.68)", border: "rgba(255,255,255,0.14)" },
  midnight: { bg: "#0f172a", fg: "#e2e8f0", muted: "rgba(226,232,240,0.66)", border: "rgba(226,232,240,0.16)" },
  slate: { bg: "#1e293b", fg: "#f1f5f9", muted: "rgba(241,245,249,0.66)", border: "rgba(241,245,249,0.16)" },
  paper: { bg: "#ffffff", fg: "#0a0a0f", muted: "rgba(10,10,15,0.62)", border: "rgba(10,10,15,0.10)" },
  cream: { bg: "#faf7f0", fg: "#1c1917", muted: "rgba(28,25,23,0.62)", border: "rgba(28,25,23,0.12)" },
} as const;

export type OgSurfaceName = keyof typeof ogSurfaces;

/* ------------------------------------------------------------------ *
 * Options
 * ------------------------------------------------------------------ */

/** The seven ready-made SVG layouts. */
export type OgTemplate =
  | "classic"
  | "minimal"
  | "split"
  | "article"
  | "product"
  | "quote"
  | "event";

/** Faint background texture for a template. */
export type OgTexture = "dots" | "grid" | "glow" | "none";

/**
 * Options for {@link ogTemplateSvg}. A superset of {@link OgOptions} — every
 * existing field still applies; the fields below are all optional additions.
 */
export interface OgTemplateOptions extends OgOptions {
  /** Which layout to render. Defaults to `"classic"` (the {@link ogSvg} look). */
  template?: OgTemplate;
  /** A named gradient from {@link ogGradients}; shorthand for `from`/`to`. */
  gradient?: OgGradientName;
  /** A named ground palette from {@link ogSurfaces} (overrides `theme` colours). */
  surface?: OgSurfaceName;
  /** Full custom control: card background colour. */
  bg?: string;
  /** Full custom control: primary text colour. */
  fg?: string;
  /** Full custom control: secondary/muted text colour. */
  muted?: string;
  /** Background texture. Defaults to `"none"`. */
  pattern?: OgTexture;
  /** Show the top accent bar. Defaults to `true` (ignored by full-bleed layouts). */
  accentBar?: boolean;
  /** A logo/avatar image as a **data URI** — rendered in the corner mark. */
  image?: string;
  /** Initials shown in the corner mark when no `image`/`logo` is given. */
  initials?: string;
  /** An emoji/icon glyph shown in a dedicated accent slot. */
  icon?: string;
  /** A handle/URL line (e.g. `"@lacspace"`) shown bottom-right. */
  handle?: string;
  /** Max title lines before the headline is truncated with `…`. Defaults to 3 (4 for `quote`). */
  maxTitleLines?: number;
  /** Author / byline — used by the `article` and `quote` templates. */
  author?: string;
  /** Publish date — used by the `article` template. */
  date?: string;
  /** Reading time (e.g. `"6 min read"`) — used by the `article` template. */
  readingTime?: string;
  /** Price value — used by the `product` template. */
  price?: string | number;
  /** Currency symbol/code prefixed to the price. */
  currency?: string;
  /** Attribution/source — used by the `quote` template. */
  cite?: string;
  /** Date/time line — used by the `event` template. */
  when?: string;
  /** Location line — used by the `event` template. */
  location?: string;
}

/* ------------------------------------------------------------------ *
 * Colour + text helpers (self-contained; index internals stay private)
 * ------------------------------------------------------------------ */

interface Colors {
  bg: string;
  fg: string;
  muted: string;
  border: string;
  from: string;
  to: string;
}

const DEFAULT_FROM = "#22d3ee";
const DEFAULT_TO = "#6366f1";

function resolveColors(o: OgTemplateOptions): Colors {
  const dark = (o.theme ?? "dark") === "dark";
  let bg = dark ? "#0a0a0f" : "#ffffff";
  let fg = dark ? "#ffffff" : "#0a0a0f";
  let muted = dark ? "rgba(255,255,255,0.68)" : "rgba(10,10,15,0.62)";
  let border = dark ? "rgba(255,255,255,0.14)" : "rgba(10,10,15,0.10)";

  if (o.surface && ogSurfaces[o.surface]) {
    const s = ogSurfaces[o.surface];
    bg = s.bg;
    fg = s.fg;
    muted = s.muted;
    border = s.border;
  }
  // Full custom colour control wins over surface/theme.
  if (o.bg) bg = o.bg;
  if (o.fg) fg = o.fg;
  if (o.muted) muted = o.muted;

  let from = o.from;
  let to = o.to;
  if ((!from || !to) && o.gradient && ogGradients[o.gradient]) {
    const g = ogGradients[o.gradient];
    from = from ?? g.from;
    to = to ?? g.to;
  }
  return { bg, fg, muted, border, from: from ?? DEFAULT_FROM, to: to ?? DEFAULT_TO };
}

/** Escape text for SVG text/attribute content. */
function esc(s: string): string {
  return String(s)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Greedy word-wrap by estimated glyph width, returning *all* natural lines (no
 * truncation). Words longer than a line are hard-broken. This is a pure
 * text-measurement heuristic — there is no canvas, so widths are approximated
 * as `fontSize * charRatio` per character (proportional fonts vary, so treat it
 * as a close estimate, not pixel-perfect).
 */
function wrapNatural(text: string, fontSize: number, maxWidth: number, charRatio: number): string[] {
  const charW = fontSize * charRatio;
  const perLine = Math.max(1, Math.floor(maxWidth / charW));
  const lines: string[] = [];
  let cur = "";
  for (const rawWord of text.split(/\s+/).filter(Boolean)) {
    let word = rawWord;
    // Hard-break a single word longer than a whole line.
    while (word.length > perLine) {
      if (cur) {
        lines.push(cur);
        cur = "";
      }
      lines.push(word.slice(0, perLine));
      word = word.slice(perLine);
    }
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > perLine && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/** Result of {@link fitTitle}. */
export interface FitResult {
  /** The chosen font size in px. */
  fontSize: number;
  /** The wrapped (and possibly ellipsised) lines. */
  lines: string[];
  /** The approximate glyph width used (`fontSize * charRatio`). */
  charWidth: number;
}

/**
 * Auto text-fit: pick a font size and wrap a title so it fits within `maxWidth`
 * and at most `maxLines` lines. Starts near `max`, then shrinks (2px steps)
 * until the wrapped text fits `maxLines` or hits `min`; if it still overflows,
 * the last line is truncated with `…`.
 *
 * Pure heuristic — glyph width is approximated as `fontSize * charRatio`
 * (default `0.56`, matching the built-in SVG renderer). No canvas is used, so
 * results are a close estimate rather than pixel-perfect.
 */
export function fitTitle(
  title: string,
  opts: { maxWidth: number; maxLines?: number; max?: number; min?: number; charRatio?: number },
): FitResult {
  const maxLines = Math.max(1, opts.maxLines ?? 3);
  const max = opts.max ?? 78;
  const min = opts.min ?? 32;
  const charRatio = opts.charRatio ?? 0.56;

  let size = Math.min(max, Math.max(min, fitFontSize(title, { max, min })));
  let lines = wrapNatural(title, size, opts.maxWidth, charRatio);
  while (size > min && lines.length > maxLines) {
    size = Math.max(min, size - 2);
    lines = wrapNatural(title, size, opts.maxWidth, charRatio);
  }
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    const last = lines[lines.length - 1]!.replace(/[.,;:\s]*$/, "");
    lines[lines.length - 1] = `${last}…`;
  }
  return { fontSize: size, lines, charWidth: size * charRatio };
}

/* ------------------------------------------------------------------ *
 * SVG fragment builders
 * ------------------------------------------------------------------ */

const NS = 'xmlns="http://www.w3.org/2000/svg"';

function defs(c: Colors, dark: boolean): string {
  return `<defs>
    <linearGradient id="lac-accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${esc(c.from)}"/><stop offset="1" stop-color="${esc(c.to)}"/>
    </linearGradient>
    <linearGradient id="lac-accent-h" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${esc(c.from)}"/><stop offset="1" stop-color="${esc(c.to)}"/>
    </linearGradient>
    <radialGradient id="lac-glow" cx="0.85" cy="0.12" r="0.75">
      <stop offset="0" stop-color="${esc(c.from)}" stop-opacity="${dark ? 0.3 : 0.22}"/>
      <stop offset="1" stop-color="${esc(c.to)}" stop-opacity="0"/>
    </radialGradient>
  </defs>`;
}

/** Background texture layer. */
function texture(kind: OgTexture | undefined, W: number, H: number, c: Colors, dark: boolean, onGradient: boolean): string {
  const k = kind ?? "none";
  if (k === "none") return "";
  if (k === "glow") return onGradient ? "" : `<rect width="${W}" height="${H}" fill="url(#lac-glow)"/>`;
  const stroke = onGradient ? "rgba(255,255,255,0.16)" : dark ? "rgba(255,255,255,0.09)" : "rgba(10,10,15,0.07)";
  if (k === "grid") {
    const gap = 48;
    return (
      `<pattern id="lac-grid" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse">` +
      `<path d="M ${gap} 0 L 0 0 0 ${gap}" fill="none" stroke="${stroke}" stroke-width="1.5"/></pattern>` +
      `<rect width="${W}" height="${H}" fill="url(#lac-grid)"/>`
    );
  }
  // dots
  return (
    `<pattern id="lac-dots" width="44" height="44" patternUnits="userSpaceOnUse">` +
    `<circle cx="4" cy="4" r="2" fill="${stroke}"/></pattern>` +
    `<rect width="${W}" height="${H}" fill="url(#lac-dots)"/>`
  );
}

/** Corner mark: image (data URI) → logo/emoji → initials → nothing. */
function mark(o: OgTemplateOptions, x: number, y: number, size: number): string {
  const rx = Math.round(size * 0.26);
  if (o.image) {
    const id = `lac-mark-${Math.round(x)}-${Math.round(y)}`;
    return (
      `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${rx}"/></clipPath>` +
      `<image href="${esc(o.image)}" x="${x}" y="${y}" width="${size}" height="${size}" ` +
      `preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`
    );
  }
  const glyph = o.logo ?? o.initials;
  if (glyph) {
    return (
      `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${rx}" fill="url(#lac-accent)"/>` +
      `<text x="${x + size / 2}" y="${y + size / 2 + size * 0.18}" font-size="${Math.round(size * 0.5)}" ` +
      `font-weight="800" text-anchor="middle" fill="#0a0a0f">${esc(glyph)}</text>`
    );
  }
  return "";
}

function titleTspans(lines: string[], x: number, y: number, size: number): string {
  const lh = size * 1.08;
  const spans = lines
    .map((line, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lh}">${esc(line)}</tspan>`)
    .join("");
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="800" letter-spacing="-1">${spans}</text>`;
}

/* ------------------------------------------------------------------ *
 * ogTemplateSvg — the zero-dependency multi-template SVG renderer
 * ------------------------------------------------------------------ */

/**
 * Render any {@link OgTemplate} as a standalone SVG string — no browser, no
 * Satori, no runtime deps. Supports named {@link ogGradients}/{@link ogSurfaces},
 * full custom colours, image/initials logo marks, background patterns, an
 * accent bar and an auto-shrinking multi-line title.
 */
export function ogTemplateSvg(options: OgTemplateOptions): string {
  const t = options.template ?? "classic";
  const c = resolveColors(options);
  const dark = (options.theme ?? "dark") === "dark";
  const W = options.width ?? 1200;
  const H = options.height ?? 630;
  const pad = Math.round(W * 0.075);
  const contentW = W - pad * 2;

  const parts: string[] = [];
  parts.push(
    `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ${NS} font-family="Inter, ui-sans-serif, system-ui, sans-serif">`,
  );
  parts.push(defs(c, dark));

  const fullBleed = t === "minimal";

  // Background.
  if (fullBleed) {
    parts.push(`<rect width="${W}" height="${H}" fill="url(#lac-accent)"/>`);
    parts.push(texture(options.pattern, W, H, c, dark, true));
  } else {
    parts.push(`<rect width="${W}" height="${H}" fill="${esc(c.bg)}"/>`);
    parts.push(texture(options.pattern ?? "glow", W, H, c, dark, false));
    if (options.accentBar !== false) {
      parts.push(`<rect width="${W}" height="${Math.round(H * 0.02)}" fill="url(#lac-accent-h)"/>`);
    }
  }

  switch (t) {
    case "minimal":
      parts.push(...renderMinimal(options, c, W, H));
      break;
    case "split":
      parts.push(...renderSplit(options, c, dark, W, H));
      break;
    case "article":
      parts.push(...renderArticle(options, c, W, H, pad, contentW));
      break;
    case "product":
      parts.push(...renderProduct(options, c, W, H, pad, contentW));
      break;
    case "quote":
      parts.push(...renderQuote(options, c, W, H, pad, contentW));
      break;
    case "event":
      parts.push(...renderEvent(options, c, W, H, pad, contentW));
      break;
    case "classic":
    default:
      parts.push(...renderClassic(options, c, W, H, pad, contentW));
      break;
  }

  parts.push(`</svg>`);
  return parts.join("");
}

/** {@link ogTemplateSvg} as a `data:` URI — drop straight into `src`/`background-image`. */
export function ogTemplateSvgDataUri(options: OgTemplateOptions): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(ogTemplateSvg(options))}`;
}

/* --- per-template renderers (return SVG fragments) --------------- */

function eyebrowSvg(o: OgTemplateOptions, c: Colors, x: number, y: number, color?: string): string {
  if (!o.eyebrow) return "";
  return `<text x="${x}" y="${y}" font-size="26" font-weight="600" letter-spacing="3" fill="${esc(
    color ?? c.from,
  )}">${esc(o.eyebrow.toUpperCase())}</text>`;
}

function badgeSvg(o: OgTemplateOptions, c: Colors, x: number, y: number): string {
  if (!o.badge) return "";
  const w = o.badge.length * 16 + 40;
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="44" rx="22" fill="${esc(c.from)}" opacity="0.18"/>` +
    `<text x="${x + 20}" y="${y + 29}" font-size="24" font-weight="700" fill="${esc(c.fg)}">${esc(o.badge)}</text>`
  );
}

function handleSvg(o: OgTemplateOptions, c: Colors, W: number, H: number, pad: number): string {
  if (!o.handle) return "";
  return `<text x="${W - pad}" y="${H - pad}" font-size="24" font-weight="600" text-anchor="end" fill="${esc(
    c.muted,
  )}">${esc(o.handle)}</text>`;
}

function footerSvg(o: OgTemplateOptions, c: Colors, x: number, y: number): string {
  if (!o.footer) return "";
  return `<text x="${x}" y="${y}" font-size="26" font-weight="500" fill="${esc(c.muted)}">${esc(o.footer)}</text>`;
}

function iconSvg(o: OgTemplateOptions, x: number, y: number, size = 64): string {
  if (!o.icon) return "";
  return `<text x="${x}" y="${y}" font-size="${size}">${esc(o.icon)}</text>`;
}

function renderClassic(o: OgTemplateOptions, c: Colors, W: number, H: number, pad: number, contentW: number): string[] {
  const out: string[] = [];
  let topY = pad + 34;
  out.push(eyebrowSvg(o, c, pad, topY));
  if (o.icon) out.push(iconSvg(o, pad, topY + 76, 60));
  if (o.image || o.logo || o.initials) out.push(mark(o, W - pad - 76, pad, 76));
  if (o.badge) {
    out.push(badgeSvg(o, c, pad, topY + 14));
    topY += 60;
  }

  const fit = fitTitle(o.title, { maxWidth: contentW, maxLines: o.maxTitleLines ?? 3, max: 78, min: 42 });
  const blockH = fit.lines.length * fit.fontSize * 1.08;
  const titleTop = H / 2 - blockH / 2 + fit.fontSize * 0.8;
  out.push(`<g fill="${esc(c.fg)}">${titleTspans(fit.lines, pad, titleTop, fit.fontSize)}</g>`);

  if (o.subtitle) {
    out.push(
      `<text x="${pad}" y="${titleTop + blockH + 30}" font-size="34" font-weight="500" fill="${esc(
        c.muted,
      )}">${esc(o.subtitle)}</text>`,
    );
  }
  out.push(footerSvg(o, c, pad, H - pad));
  out.push(handleSvg(o, c, W, H, pad));
  return out;
}

function renderMinimal(o: OgTemplateOptions, c: Colors, W: number, H: number): string[] {
  const out: string[] = [];
  const pad = Math.round(W * 0.1);
  const cx = W / 2;
  const fit = fitTitle(o.title, { maxWidth: W - pad * 2, maxLines: o.maxTitleLines ?? 3, max: 96, min: 52 });
  const blockH = fit.lines.length * fit.fontSize * 1.05;
  let y = H / 2 - blockH / 2 + fit.fontSize * 0.75;

  if (o.eyebrow) {
    out.push(
      `<text x="${cx}" y="${y - fit.fontSize - 12}" font-size="28" font-weight="600" letter-spacing="4" ` +
        `text-anchor="middle" fill="rgba(255,255,255,0.88)">${esc(o.eyebrow.toUpperCase())}</text>`,
    );
  }
  if (o.icon) out.push(`<text x="${cx}" y="${y - fit.fontSize - 70}" font-size="72" text-anchor="middle">${esc(o.icon)}</text>`);

  const spans = fit.lines
    .map((line, i) => `<tspan x="${cx}" dy="${i === 0 ? 0 : fit.fontSize * 1.05}">${esc(line)}</tspan>`)
    .join("");
  out.push(
    `<text x="${cx}" y="${y}" font-size="${fit.fontSize}" font-weight="800" letter-spacing="-1" ` +
      `text-anchor="middle" fill="#ffffff">${spans}</text>`,
  );
  y += blockH;
  if (o.subtitle) {
    out.push(
      `<text x="${cx}" y="${y + 30}" font-size="34" font-weight="500" text-anchor="middle" ` +
        `fill="rgba(255,255,255,0.85)">${esc(o.subtitle)}</text>`,
    );
  }
  if (o.footer) {
    out.push(
      `<text x="${cx}" y="${H - Math.round(H * 0.06)}" font-size="26" font-weight="500" text-anchor="middle" ` +
        `fill="rgba(255,255,255,0.78)">${esc(o.footer)}</text>`,
    );
  }
  return out;
}

function renderSplit(o: OgTemplateOptions, c: Colors, dark: boolean, W: number, H: number): string[] {
  const out: string[] = [];
  const panelW = Math.round(W * 0.38);
  const leftW = W - panelW;
  const pad = Math.round(W * 0.065);
  const contentW = leftW - pad * 2;

  // Right accent panel with a large mark/initial.
  out.push(`<rect x="${leftW}" y="0" width="${panelW}" height="${H}" fill="url(#lac-accent)"/>`);
  const glyph = o.logo ?? o.initials ?? (o.title.trim().charAt(0).toUpperCase() || "•");
  if (o.image) {
    out.push(
      `<clipPath id="lac-split-img"><circle cx="${leftW + panelW / 2}" cy="${H / 2}" r="${Math.round(H * 0.22)}"/></clipPath>` +
        `<image href="${esc(o.image)}" x="${leftW + panelW / 2 - Math.round(H * 0.22)}" y="${H / 2 - Math.round(H * 0.22)}" ` +
        `width="${Math.round(H * 0.44)}" height="${Math.round(H * 0.44)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#lac-split-img)"/>`,
    );
  } else {
    out.push(
      `<text x="${leftW + panelW / 2}" y="${H / 2 + 80}" font-size="220" font-weight="800" text-anchor="middle" fill="#0a0a0f">${esc(
        glyph,
      )}</text>`,
    );
  }

  // Left column.
  let y = H / 2 - 40;
  out.push(eyebrowSvg(o, c, pad, y - 60));
  const fit = fitTitle(o.title, { maxWidth: contentW, maxLines: o.maxTitleLines ?? 3, max: 68, min: 40 });
  const blockH = fit.lines.length * fit.fontSize * 1.08;
  y = H / 2 - blockH / 2 + fit.fontSize * 0.4;
  out.push(`<g fill="${esc(c.fg)}">${titleTspans(fit.lines, pad, y, fit.fontSize)}</g>`);
  y += blockH;
  if (o.subtitle) {
    out.push(
      `<text x="${pad}" y="${y + 24}" font-size="32" font-weight="500" fill="${esc(c.muted)}">${esc(o.subtitle)}</text>`,
    );
    y += 44;
  }
  if (o.badge) out.push(badgeSvg(o, c, pad, y + 20));
  out.push(footerSvg(o, c, pad, H - pad));
  return out;
}

function renderArticle(o: OgTemplateOptions, c: Colors, W: number, H: number, pad: number, contentW: number): string[] {
  const out: string[] = [];
  out.push(eyebrowSvg(o, c, pad, pad + 34));
  if (o.image || o.logo || o.initials) out.push(mark(o, W - pad - 72, pad, 72));

  const fit = fitTitle(o.title, { maxWidth: contentW, maxLines: o.maxTitleLines ?? 3, max: 74, min: 40 });
  const titleTop = pad + 150;
  out.push(`<g fill="${esc(c.fg)}">${titleTspans(fit.lines, pad, titleTop, fit.fontSize)}</g>`);

  // Footer meta row: author · date · reading time.
  const meta: string[] = [];
  if (o.author) meta.push(o.author);
  if (o.date) meta.push(o.date);
  if (o.readingTime) meta.push(o.readingTime);
  if (meta.length) {
    const y = H - pad;
    let x = pad;
    meta.forEach((m, i) => {
      const bold = i === 0 && !!o.author;
      out.push(
        `<text x="${x}" y="${y}" font-size="${bold ? 28 : 26}" font-weight="${bold ? 700 : 500}" fill="${esc(
          bold ? c.fg : c.muted,
        )}">${esc(m)}</text>`,
      );
      x += m.length * (bold ? 15 : 13) + 20;
      if (i < meta.length - 1) {
        out.push(`<text x="${x}" y="${y}" font-size="26" fill="${esc(c.muted)}" opacity="0.6">·</text>`);
        x += 24;
      }
    });
  } else {
    out.push(footerSvg(o, c, pad, H - pad));
  }
  out.push(handleSvg(o, c, W, H, pad));
  return out;
}

function renderProduct(o: OgTemplateOptions, c: Colors, W: number, H: number, pad: number, contentW: number): string[] {
  const out: string[] = [];
  if (o.badge) out.push(badgeSvg(o, c, pad, pad + 14));
  if (o.image || o.logo || o.initials) out.push(mark(o, W - pad - 76, pad, 76));

  const fit = fitTitle(o.title, { maxWidth: contentW, maxLines: o.maxTitleLines ?? 2, max: 76, min: 42 });
  const titleTop = pad + 170;
  out.push(`<g fill="${esc(c.fg)}">${titleTspans(fit.lines, pad, titleTop, fit.fontSize)}</g>`);
  const blockH = fit.lines.length * fit.fontSize * 1.08;
  if (o.subtitle) {
    out.push(
      `<text x="${pad}" y="${titleTop + blockH + 4}" font-size="32" font-weight="500" fill="${esc(c.muted)}">${esc(
        o.subtitle,
      )}</text>`,
    );
  }

  const priceStr =
    o.price === undefined || o.price === null ? undefined : `${o.currency ?? ""}${o.price}`;
  if (priceStr) {
    out.push(
      `<text x="${pad}" y="${H - pad}" font-size="88" font-weight="800" letter-spacing="-1" fill="url(#lac-accent-h)">${esc(
        priceStr,
      )}</text>`,
    );
  } else {
    out.push(footerSvg(o, c, pad, H - pad));
  }
  out.push(handleSvg(o, c, W, H, pad));
  return out;
}

function renderQuote(o: OgTemplateOptions, c: Colors, W: number, H: number, pad: number, contentW: number): string[] {
  const out: string[] = [];
  // Big decorative opening quote mark.
  out.push(
    `<text x="${pad - 6}" y="${pad + 150}" font-size="200" font-weight="800" fill="url(#lac-accent-h)" opacity="0.85">&#8220;</text>`,
  );
  const fit = fitTitle(o.title, { maxWidth: contentW, maxLines: o.maxTitleLines ?? 4, max: 62, min: 34 });
  const titleTop = pad + 220;
  out.push(
    `<text x="${pad}" y="${titleTop}" font-size="${fit.fontSize}" font-weight="700" letter-spacing="-0.5" fill="${esc(
      c.fg,
    )}">${fit.lines.map((l, i) => `<tspan x="${pad}" dy="${i === 0 ? 0 : fit.fontSize * 1.16}">${esc(l)}</tspan>`).join("")}</text>`,
  );

  // Attribution.
  const cite = o.author ?? o.cite ?? o.footer;
  if (cite) {
    const y = H - pad;
    if (o.image || o.logo || o.initials) {
      out.push(mark(o, pad, y - 58, 58));
      out.push(`<text x="${pad + 78}" y="${y - 18}" font-size="30" font-weight="700" fill="${esc(c.fg)}">${esc(cite)}</text>`);
      if (o.cite && o.author) {
        out.push(`<text x="${pad + 78}" y="${y + 14}" font-size="24" font-weight="500" fill="${esc(c.muted)}">${esc(o.cite)}</text>`);
      }
    } else {
      out.push(`<text x="${pad}" y="${y}" font-size="30" font-weight="700" fill="${esc(c.fg)}">— ${esc(cite)}</text>`);
    }
  }
  out.push(handleSvg(o, c, W, H, pad));
  return out;
}

function renderEvent(o: OgTemplateOptions, c: Colors, W: number, H: number, pad: number, contentW: number): string[] {
  const out: string[] = [];
  out.push(eyebrowSvg(o, c, pad, pad + 34));
  if (o.icon) out.push(iconSvg(o, W - pad - 70, pad + 60, 64));
  else if (o.image || o.logo || o.initials) out.push(mark(o, W - pad - 76, pad, 76));

  const fit = fitTitle(o.title, { maxWidth: contentW, maxLines: o.maxTitleLines ?? 2, max: 80, min: 44 });
  const titleTop = pad + 150;
  out.push(`<g fill="${esc(c.fg)}">${titleTspans(fit.lines, pad, titleTop, fit.fontSize)}</g>`);

  // Prominent date/time in the accent gradient.
  let y = H - pad - 46;
  if (o.when) {
    out.push(
      `<text x="${pad}" y="${y}" font-size="44" font-weight="800" letter-spacing="-0.5" fill="url(#lac-accent-h)">${esc(
        o.when,
      )}</text>`,
    );
    y += 44;
  }
  if (o.location) {
    out.push(`<text x="${pad}" y="${y}" font-size="30" font-weight="500" fill="${esc(c.muted)}">${esc(o.location)}</text>`);
  } else if (!o.when) {
    out.push(footerSvg(o, c, pad, H - pad));
  }
  out.push(handleSvg(o, c, W, H, pad));
  return out;
}

/* ================================================================== *
 * next/og element-tree layouts (quote + event) — parity with ogCard*
 * ================================================================== */

function el(type: string, style: OgStyle, children?: (OgNode | string)[] | OgNode | string): OgNode {
  return { type, key: null, props: { style, ...(children === undefined ? {} : { children }) } };
}

function elImg(src: string, style: OgStyle): OgNode {
  return { type: "img", key: null, props: { src, style } };
}

/** Corner mark as an element-tree node (image → logo/initials). */
function markNode(o: OgTemplateOptions, c: Colors, size: number): OgNode {
  if (o.image) {
    return elImg(o.image, {
      display: "flex",
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: `${Math.round(size * 0.26)}px`,
      objectFit: "cover",
    });
  }
  const glyph = o.logo ?? o.initials ?? "";
  return el(
    "div",
    {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: `${Math.round(size * 0.26)}px`,
      fontSize: `${Math.round(size * 0.5)}px`,
      fontWeight: 800,
      color: "#0a0a0f",
      background: `linear-gradient(135deg, ${c.from}, ${c.to})`,
    },
    glyph,
  );
}

/** Common accent bar node. */
function accentBarNode(c: Colors, H: number): OgNode {
  return el("div", {
    position: "absolute",
    top: "0",
    left: "0",
    width: "100%",
    height: `${Math.round(H * 0.02)}px`,
    background: `linear-gradient(90deg, ${c.from}, ${c.to})`,
  });
}

/**
 * A pull-quote / testimonial share card (element tree): a big gradient quote
 * mark, the quote text, and an attribution row (author + optional `cite`, with
 * an optional avatar `image`/`logo`).
 */
export function ogQuote(options: OgTemplateOptions): OgNode {
  const c = resolveColors(options);
  const H = options.height ?? 630;
  const pad = Math.round((options.width ?? 1200) * 0.075);
  const titleSize = fitFontSize(options.title, { max: 62, min: 34 });

  const children: OgNode[] = [accentBarNode(c, H)];
  children.push(
    el(
      "div",
      {
        display: "flex",
        fontSize: "160px",
        fontWeight: 800,
        lineHeight: 0.9,
        height: "110px",
        background: `linear-gradient(90deg, ${c.from}, ${c.to})`,
        backgroundClip: "text",
        color: "transparent",
      },
      "“",
    ),
  );
  children.push(
    el(
      "div",
      { display: "flex", fontSize: `${titleSize}px`, fontWeight: 700, lineHeight: 1.16, letterSpacing: "-0.01em", color: c.fg },
      options.title,
    ),
  );

  const cite = options.author ?? options.cite ?? options.footer;
  if (cite) {
    const attr: (OgNode | string)[] = [];
    if (options.image || options.logo || options.initials) attr.push(markNode(options, c, 58));
    const lines: OgNode[] = [
      el("div", { display: "flex", fontSize: "30px", fontWeight: 700, color: c.fg }, cite),
    ];
    if (options.cite && options.author) {
      lines.push(el("div", { display: "flex", fontSize: "24px", fontWeight: 500, color: c.muted }, options.cite));
    }
    attr.push(el("div", { display: "flex", flexDirection: "column", justifyContent: "center" }, lines));
    children.push(el("div", { display: "flex", alignItems: "center", gap: "18px" }, attr));
  }

  return el(
    "div",
    {
      position: "relative",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      width: "100%",
      height: "100%",
      padding: `${pad}px`,
      background: c.bg,
      color: c.fg,
      fontFamily: "sans-serif",
    },
    children,
  );
}

/**
 * An event / webinar share card (element tree): category eyebrow, event title,
 * a prominent gradient date/time line and a location line, plus an optional
 * icon or logo mark.
 */
export function ogEvent(options: OgTemplateOptions): OgNode {
  const c = resolveColors(options);
  const H = options.height ?? 630;
  const pad = Math.round((options.width ?? 1200) * 0.075);
  const titleSize = fitFontSize(options.title, { max: 80, min: 44 });

  const header = el(
    "div",
    { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" },
    [
      options.eyebrow
        ? el(
            "div",
            {
              display: "flex",
              fontSize: "26px",
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: c.from,
            },
            options.eyebrow.toUpperCase(),
          )
        : el("div", { display: "flex" }, ""),
      options.icon
        ? el("div", { display: "flex", fontSize: "64px" }, options.icon)
        : options.image || options.logo || options.initials
          ? markNode(options, c, 76)
          : el("div", { display: "flex" }, ""),
    ],
  );

  const title = el(
    "div",
    { display: "flex", fontSize: `${titleSize}px`, fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.02em", color: c.fg },
    options.title,
  );

  const bottom: OgNode[] = [];
  if (options.when) {
    bottom.push(
      el(
        "div",
        {
          display: "flex",
          fontSize: "44px",
          fontWeight: 800,
          letterSpacing: "-0.01em",
          background: `linear-gradient(90deg, ${c.from}, ${c.to})`,
          backgroundClip: "text",
          color: "transparent",
        },
        options.when,
      ),
    );
  }
  if (options.location) {
    bottom.push(el("div", { display: "flex", fontSize: "30px", fontWeight: 500, color: c.muted }, options.location));
  }
  if (!bottom.length && options.footer) {
    bottom.push(el("div", { display: "flex", fontSize: "26px", fontWeight: 500, color: c.muted }, options.footer));
  }

  return el(
    "div",
    {
      position: "relative",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      width: "100%",
      height: "100%",
      padding: `${pad}px`,
      background: c.bg,
      color: c.fg,
      fontFamily: "sans-serif",
    },
    [
      accentBarNode(c, H),
      header,
      el("div", { display: "flex", flexDirection: "column" }, [title]),
      el("div", { display: "flex", flexDirection: "column", gap: "10px" }, bottom),
    ],
  );
}
