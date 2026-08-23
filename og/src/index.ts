/**
 * @lacspace/og
 * Beautiful, dynamic Open Graph images — a design system you configure once and
 * call per page. Produces a `next/og` element tree *and* a zero-dependency SVG
 * from the same options, with auto-fitting titles, presets and palettes.
 *
 * ```tsx
 * // app/og/route.tsx
 * import { ImageResponse } from "next/og";
 * import { ogCard } from "@lacspace/og";
 *
 * export const runtime = "edge";
 * export function GET(req: Request) {
 *   const title = new URL(req.url).searchParams.get("title") ?? "My site";
 *   return new ImageResponse(
 *     ogCard({ title, subtitle: "my-site.com", from: "#22d3ee", to: "#6366f1" }) as any,
 *     { width: 1200, height: 630 },
 *   );
 * }
 * ```
 *
 * Zero dependencies · isomorphic · fully typed.
 */

/* ------------------------------------------------------------------ *
 * Options
 * ------------------------------------------------------------------ */

export type OgPreset = "gradient" | "split" | "minimal" | "terminal";
export type OgTheme = "dark" | "light";

export interface OgOptions {
  /** The headline. Font size auto-fits to length. */
  title: string;
  /** Secondary line under the title (often your domain). */
  subtitle?: string;
  /** Small uppercase label above the title (a section or category). */
  eyebrow?: string;
  /** A pill badge (e.g. "NEW", "Guide"). */
  badge?: string;
  /** Text/initial/emoji for the corner logo mark. */
  logo?: string;
  /** Footer line, bottom-left (e.g. your URL). */
  footer?: string;
  /** Accent gradient start / end. */
  from?: string;
  to?: string;
  /** "dark" (default) or "light" ground. */
  theme?: OgTheme;
  /** Layout preset. */
  preset?: OgPreset;
  /** Canvas size. Defaults to the OG standard 1200×630. */
  width?: number;
  height?: number;
}

interface Resolved extends Required<Omit<OgOptions, "subtitle" | "eyebrow" | "badge" | "logo" | "footer">> {
  subtitle?: string;
  eyebrow?: string;
  badge?: string;
  logo?: string;
  footer?: string;
}

const DEFAULTS = {
  from: "#22d3ee",
  to: "#6366f1",
  theme: "dark" as OgTheme,
  preset: "gradient" as OgPreset,
  width: 1200,
  height: 630,
};

function resolve(o: OgOptions): Resolved {
  return {
    title: o.title,
    subtitle: o.subtitle,
    eyebrow: o.eyebrow,
    badge: o.badge,
    logo: o.logo,
    footer: o.footer,
    from: o.from ?? DEFAULTS.from,
    to: o.to ?? DEFAULTS.to,
    theme: o.theme ?? DEFAULTS.theme,
    preset: o.preset ?? DEFAULTS.preset,
    width: o.width ?? DEFAULTS.width,
    height: o.height ?? DEFAULTS.height,
  };
}

/* ------------------------------------------------------------------ *
 * Shared design math
 * ------------------------------------------------------------------ */

/** Pick a title font size that keeps long headlines readable and short ones bold. */
export function fitFontSize(
  title: string,
  opts: { max?: number; min?: number } = {},
): number {
  const max = opts.max ?? 78;
  const min = opts.min ?? 42;
  const len = title.length;
  if (len <= 20) return max;
  if (len >= 90) return min;
  // Linear falloff between the two anchors.
  const t = (len - 20) / (90 - 20);
  return Math.round(max - t * (max - min));
}

interface Palette {
  bg: string;
  fg: string;
  muted: string;
  border: string;
  from: string;
  to: string;
}

function palette(r: Resolved): Palette {
  const dark = r.theme === "dark";
  return {
    bg: dark ? "#0a0a0f" : "#ffffff",
    fg: dark ? "#ffffff" : "#0a0a0f",
    muted: dark ? "rgba(255,255,255,0.68)" : "rgba(10,10,15,0.62)",
    border: dark ? "rgba(255,255,255,0.14)" : "rgba(10,10,15,0.10)",
    from: r.from,
    to: r.to,
  };
}

/* ------------------------------------------------------------------ *
 * next/og element tree
 * ------------------------------------------------------------------ */

export type OgStyle = Record<string, string | number>;
export interface OgNode {
  type: string;
  props: { style?: OgStyle; children?: (OgNode | string)[] | OgNode | string; [k: string]: unknown };
  key?: null;
}

function el(type: string, style: OgStyle, children?: (OgNode | string)[] | OgNode | string): OgNode {
  return { type, key: null, props: { style, ...(children === undefined ? {} : { children }) } };
}

/**
 * Build a `next/og`-compatible element tree for a share card. Pass it straight
 * to `new ImageResponse(ogCard(opts) as any, { width, height })`.
 *
 * (The `as any` sidesteps a React type mismatch — the object is a valid Satori
 * node, which is what `next/og` renders under the hood.)
 */
export function ogCard(options: OgOptions): OgNode {
  const r = resolve(options);
  const p = palette(r);
  const pad = Math.round(r.width * 0.075);
  const titleSize = fitFontSize(r.title);

  const accentBar = el("div", {
    position: "absolute",
    top: "0",
    left: "0",
    width: "100%",
    height: `${Math.round(r.height * 0.02)}px`,
    background: `linear-gradient(90deg, ${p.from}, ${p.to})`,
  });

  const glow = el("div", {
    position: "absolute",
    top: `-${Math.round(r.height * 0.35)}px`,
    right: `-${Math.round(r.width * 0.18)}px`,
    width: `${Math.round(r.width * 0.55)}px`,
    height: `${Math.round(r.width * 0.55)}px`,
    borderRadius: "9999px",
    background: `linear-gradient(135deg, ${p.from}, ${p.to})`,
    opacity: r.theme === "dark" ? "0.22" : "0.16",
    filter: "blur(20px)",
  });

  const topRow: (OgNode | string)[] = [];
  if (r.eyebrow) {
    topRow.push(
      el(
        "div",
        {
          display: "flex",
          fontSize: "26px",
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: p.from,
        },
        r.eyebrow.toUpperCase(),
      ),
    );
  }
  if (r.badge) {
    topRow.push(
      el(
        "div",
        {
          display: "flex",
          alignItems: "center",
          padding: "8px 20px",
          borderRadius: "9999px",
          fontSize: "24px",
          fontWeight: 700,
          color: p.fg,
          background: `linear-gradient(90deg, ${p.from}33, ${p.to}33)`,
          border: `1px solid ${p.border}`,
        },
        r.badge,
      ),
    );
  }

  const header = el(
    "div",
    { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" },
    [
      topRow.length
        ? el("div", { display: "flex", gap: "20px", alignItems: "center" }, topRow)
        : el("div", { display: "flex" }, ""),
      r.logo
        ? el(
            "div",
            {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "76px",
              height: "76px",
              borderRadius: "20px",
              fontSize: "40px",
              fontWeight: 800,
              color: "#0a0a0f",
              background: `linear-gradient(135deg, ${p.from}, ${p.to})`,
            },
            r.logo,
          )
        : el("div", { display: "flex" }, ""),
    ],
  );

  const body: (OgNode | string)[] = [
    el(
      "div",
      {
        display: "flex",
        fontSize: `${titleSize}px`,
        fontWeight: 800,
        lineHeight: 1.05,
        letterSpacing: "-0.02em",
        color: p.fg,
      },
      r.title,
    ),
  ];
  if (r.subtitle) {
    body.push(
      el(
        "div",
        { display: "flex", marginTop: "28px", fontSize: "34px", fontWeight: 500, color: p.muted },
        r.subtitle,
      ),
    );
  }

  const children: OgNode[] = [
    accentBar,
    glow,
    header,
    el("div", { display: "flex", flexDirection: "column" }, body),
  ];

  if (r.footer) {
    children.push(
      el(
        "div",
        { display: "flex", fontSize: "26px", fontWeight: 500, color: p.muted },
        r.footer,
      ),
    );
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
      background: r.preset === "split" ? `linear-gradient(135deg, ${p.from}, ${p.to})` : p.bg,
      color: p.fg,
      fontFamily: "sans-serif",
    },
    children,
  );
}

/* ------------------------------------------------------------------ *
 * Zero-dependency SVG (previews, emails, icons, guaranteed fallback)
 * ------------------------------------------------------------------ */

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Greedy word-wrap by estimated glyph width. */
function wrap(text: string, fontSize: number, maxWidth: number, maxLines: number): string[] {
  const charW = fontSize * 0.56;
  const perLine = Math.max(1, Math.floor(maxWidth / charW));
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > perLine && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines - 1) break;
    } else {
      cur = next;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  const used = lines.join(" ").length;
  if (used < text.length && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1]!.replace(/\.*$/, "")}…`;
  }
  return lines;
}

/**
 * Render a share card as a standalone SVG string — no browser, no runtime deps.
 * Perfect for previews, email headers, README banners and icons.
 */
export function ogSvg(options: OgOptions): string {
  const r = resolve(options);
  const p = palette(r);
  const W = r.width;
  const H = r.height;
  const pad = Math.round(W * 0.075);
  const titleSize = fitFontSize(r.title);
  const contentW = W - pad * 2;
  const split = r.preset === "split";

  const titleLines = wrap(r.title, titleSize, contentW, 3);
  const titleBlockH = titleLines.length * titleSize * 1.08;
  const titleTop = H / 2 - titleBlockH / 2 + titleSize * 0.8;

  const parts: string[] = [];
  parts.push(
    `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Inter, ui-sans-serif, system-ui, sans-serif">`,
  );
  parts.push(`<defs>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${esc(p.from)}"/><stop offset="1" stop-color="${esc(p.to)}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.85" cy="0.1" r="0.7">
      <stop offset="0" stop-color="${esc(p.from)}" stop-opacity="${r.theme === "dark" ? 0.28 : 0.2}"/>
      <stop offset="1" stop-color="${esc(p.to)}" stop-opacity="0"/>
    </radialGradient>
  </defs>`);

  // background
  parts.push(`<rect width="${W}" height="${H}" fill="${split ? "url(#accent)" : esc(p.bg)}"/>`);
  if (!split) parts.push(`<rect width="${W}" height="${H}" fill="url(#glow)"/>`);
  // accent bar
  parts.push(`<rect width="${W}" height="${Math.round(H * 0.02)}" fill="url(#accent)"/>`);

  // eyebrow
  let topY = pad + 34;
  if (r.eyebrow) {
    parts.push(
      `<text x="${pad}" y="${topY}" font-size="26" font-weight="600" letter-spacing="3" fill="${esc(p.from)}">${esc(
        r.eyebrow.toUpperCase(),
      )}</text>`,
    );
  }
  // logo mark (top-right)
  if (r.logo) {
    const s = 76;
    const lx = W - pad - s;
    const ly = pad;
    parts.push(`<rect x="${lx}" y="${ly}" width="${s}" height="${s}" rx="20" fill="url(#accent)"/>`);
    parts.push(
      `<text x="${lx + s / 2}" y="${ly + s / 2 + 14}" font-size="40" font-weight="800" text-anchor="middle" fill="#0a0a0f">${esc(
        r.logo,
      )}</text>`,
    );
  }
  // badge
  if (r.badge) {
    const bx = pad + (r.eyebrow ? 0 : 0);
    parts.push(
      `<rect x="${bx}" y="${topY + 14}" width="${r.badge.length * 16 + 40}" height="44" rx="22" fill="${esc(
        p.from,
      )}" opacity="0.18"/>`,
    );
    parts.push(
      `<text x="${bx + 20}" y="${topY + 43}" font-size="24" font-weight="700" fill="${esc(p.fg)}">${esc(
        r.badge,
      )}</text>`,
    );
    topY += 60;
  }

  // title (wrapped)
  titleLines.forEach((line, i) => {
    parts.push(
      `<text x="${pad}" y="${titleTop + i * titleSize * 1.08}" font-size="${titleSize}" font-weight="800" letter-spacing="-1" fill="${esc(
        p.fg,
      )}">${esc(line)}</text>`,
    );
  });
  // subtitle
  if (r.subtitle) {
    parts.push(
      `<text x="${pad}" y="${titleTop + titleLines.length * titleSize * 1.08 + 46}" font-size="34" font-weight="500" fill="${esc(
        p.muted,
      )}">${esc(r.subtitle)}</text>`,
    );
  }
  // footer
  if (r.footer) {
    parts.push(
      `<text x="${pad}" y="${H - pad}" font-size="26" font-weight="500" fill="${esc(p.muted)}">${esc(
        r.footer,
      )}</text>`,
    );
  }

  parts.push(`</svg>`);
  return parts.join("");
}

/** SVG as a `data:` URI — drop straight into `src` / `background-image`. */
export function ogSvgDataUri(options: OgOptions): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(ogSvg(options))}`;
}
