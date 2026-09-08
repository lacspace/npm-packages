/**
 * @lacspace/pdf
 *
 * Generate real PDFs — invoices, receipts and documents — with **zero
 * dependencies** and no headless browser. Most PDF libraries are either huge
 * (pdfkit) or spin up Chromium (puppeteer); this builds the raw PDF bytes
 * directly and runs anywhere: Node, edge runtimes and the browser.
 *
 * - Accurate text layout (real Helvetica metrics → correct wrapping & alignment)
 * - A flowing document builder with auto page-breaks
 * - Batteries-included `invoice()` and `receipt()` generators
 * - Output as Uint8Array, base64 or a data URI
 */

import { baseFontName, glyphWidth } from "./fonts";
import type { FontFamily, FontSpec } from "./fonts";
import { jpegImage, rgbImage } from "./image";
import type { EmbeddedImage, ImageColorSpace } from "./image";

export { jpegImage, rgbImage };
export type { FontFamily, FontSpec, EmbeddedImage, ImageColorSpace };

/* ------------------------------------------------------------------ *
 * Font metrics (Helvetica / Helvetica-Bold, 1000-unit em) + WinAnsi
 * ------------------------------------------------------------------ */

const HELV = "278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584"
  .split(" ").map(Number);
const HELVB = "278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584"
  .split(" ").map(Number);
const HIGH: Record<number, number> = { 0x85: 1000, 0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0x95: 350, 0x96: 556, 0x97: 1000, 0xa9: 737 };
const HIGH_B: Record<number, number> = { 0x85: 1000, 0x91: 238, 0x92: 238, 0x93: 500, 0x94: 500, 0x95: 350, 0x96: 556, 0x97: 1000, 0xa9: 737 };

function charWidth(code: number, bold: boolean): number {
  if (code >= 32 && code <= 126) return (bold ? HELVB : HELV)[code - 32]!;
  return (bold ? HIGH_B : HIGH)[code] ?? (bold ? 611 : 556);
}

const UNI: Record<string, number> = {
  "“": 0x93, "”": 0x94, "‘": 0x91, "’": 0x92, "—": 0x97,
  "–": 0x96, "…": 0x85, "•": 0x95, "©": 0xa9, "®": 0xae,
  "™": 0x99, "€": 0x80,
};

/** Map a JS string to WinAnsi byte codes. */
function toBytes(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (code === 0x2192) { out.push(45, 62); continue; }        // → -> "->"
    if (code === 0x20b9) { out.push(82, 115); continue; }       // ₹ -> "Rs"
    if (code <= 0xff) { out.push(code); continue; }
    if (ch in UNI) { out.push(UNI[ch]!); continue; }
    out.push(0x3f);                                             // '?'
  }
  return out;
}

/** Text width in points for a given font size. */
export function textWidth(s: string, size: number, bold = false): number {
  let w = 0;
  for (const b of toBytes(s)) w += charWidth(b, bold);
  return (w * size) / 1000;
}

/** WinAnsi bytes → escaped latin1 body for a PDF string literal. */
function pdfEscape(s: string): string {
  let out = "";
  for (const b of toBytes(s)) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) out += "\\";
    out += String.fromCharCode(b);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Public types
 * ------------------------------------------------------------------ */

export type RGB = [number, number, number];
export type Align = "left" | "center" | "right";
export type PageSize = "A3" | "A4" | "A5" | "Letter" | "Legal";
export type Orientation = "portrait" | "landscape";

const SIZES: Record<PageSize, [number, number]> = {
  A3: [841.89, 1190.55],
  A4: [595.28, 841.89],
  A5: [419.53, 595.28],
  Letter: [612, 792],
  Legal: [612, 1008],
};

export interface Margins { top: number; right: number; bottom: number; left: number; }

export interface DocOptions {
  size?: PageSize;
  /** Page orientation (default `"portrait"`). Landscape swaps width/height. */
  orientation?: Orientation;
  margins?: number | Partial<Margins>;
  /** Base body font size (default 11). */
  fontSize?: number;
  /** Accent colour for headings/rules (default Lacspace blue). */
  accent?: RGB;
  /** Body text colour (default near-black). */
  ink?: RGB;
  /** Muted colour for labels/footers (default grey). */
  muted?: RGB;
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
}

export interface TextOptions {
  size?: number;
  bold?: boolean;
  /** Italic / oblique style (default false). */
  italic?: boolean;
  /** Font family (default `"helvetica"`). Adds Times & Courier from the standard 14. */
  family?: FontFamily;
  color?: RGB;
  align?: Align;
  /** Extra space (pts) after the line. */
  gap?: number;
}

export interface ImageOptions {
  /** Rendered width in points. Height is derived from the aspect ratio if omitted. */
  width?: number;
  /** Rendered height in points. Width is derived from the aspect ratio if omitted. */
  height?: number;
  /** Horizontal placement within the content width when `x` is not given (default `"left"`). */
  align?: Align;
  /** Absolute x (points from the left edge). Overrides `align`. */
  x?: number;
  /** Extra space (pts) after the image. */
  gap?: number;
}

export interface FooterOptions {
  /** Template string, e.g. `"Page {page} of {pages}"` (default `"{page} / {pages}"`). */
  text?: string;
  /** Custom renderer; overrides `text`. Return the footer string for a page. */
  render?: (page: number, pages: number) => string;
  align?: Align;
  size?: number;
  color?: RGB;
  bold?: boolean;
  family?: FontFamily;
}

export interface TableColumn {
  header: string;
  /** Column width — a fraction of content width (0–1) or absolute points (>1). */
  width: number;
  align?: Align;
}

export interface TableOptions {
  columns: TableColumn[];
  rows: (string | number)[][];
  fontSize?: number;
  headerColor?: RGB;
  /** Zebra-stripe background for alternate rows. */
  zebra?: boolean;
  /** Draw a full grid (outer border + cell borders) around every cell. */
  border?: boolean;
  /** Grid line colour (default light grey). Only used when `border` is set. */
  borderColor?: RGB;
}

interface OutlineEntry { title: string; level: number; page: number; y: number; }

/* ------------------------------------------------------------------ *
 * The document builder
 * ------------------------------------------------------------------ */

const DEFAULT_ACCENT: RGB = [0.13, 0.43, 0.95];
const DEFAULT_INK: RGB = [0.09, 0.11, 0.16];
const DEFAULT_MUTED: RGB = [0.42, 0.46, 0.53];

const rgb = (c: RGB): string => `${c[0].toFixed(3)} ${c[1].toFixed(3)} ${c[2].toFixed(3)}`;
const n2 = (x: number): string => x.toFixed(2);

export class PdfDocument {
  readonly pageW: number;
  readonly pageH: number;
  readonly m: Margins;
  readonly contentW: number;
  private y: number;
  private pages: string[] = [];
  private cur = "";
  private readonly base: number;
  private readonly accent: RGB;
  private readonly ink: RGB;
  private readonly muted: RGB;
  private readonly meta: { title?: string; author?: string; subject?: string; keywords?: string[] };
  /** Extra (non-Helvetica-regular/-bold) fonts, keyed by BaseFont → resource name. */
  private readonly fontReg = new Map<string, string>();
  private readonly images: EmbeddedImage[] = [];
  private readonly outline: OutlineEntry[] = [];
  private footerCfg?: FooterOptions;

  constructor(opts: DocOptions = {}) {
    let [w, h] = SIZES[opts.size ?? "A4"];
    if (opts.orientation === "landscape") [w, h] = [h, w];
    this.pageW = w;
    this.pageH = h;
    const mg = opts.margins;
    const d = 56;
    this.m =
      typeof mg === "number"
        ? { top: mg, right: mg, bottom: mg, left: mg }
        : { top: mg?.top ?? d, right: mg?.right ?? d, bottom: mg?.bottom ?? d, left: mg?.left ?? d };
    this.contentW = w - this.m.left - this.m.right;
    this.y = h - this.m.top;
    this.base = opts.fontSize ?? 11;
    this.accent = opts.accent ?? DEFAULT_ACCENT;
    this.ink = opts.ink ?? DEFAULT_INK;
    this.muted = opts.muted ?? DEFAULT_MUTED;
    this.meta = { title: opts.title, author: opts.author, subject: opts.subject, keywords: opts.keywords };
  }

  /** Current vertical cursor (points from the bottom of the page). */
  get cursor(): number { return this.y; }

  private op(s: string): void { this.cur += s; }

  private ensure(height: number): void {
    if (this.y - height < this.m.bottom) this.addPage();
  }

  /** Force a new page. */
  addPage(): this {
    this.pages.push(this.cur);
    this.cur = "";
    this.y = this.pageH - this.m.top;
    return this;
  }

  private xFor(text: string, size: number, bold: boolean, align: Align): number {
    if (align === "left") return this.m.left;
    const w = textWidth(text, size, bold);
    if (align === "right") return this.pageW - this.m.right - w;
    return this.m.left + (this.contentW - w) / 2;
  }

  /** Horizontal offset for a pre-measured line width and alignment. */
  private xForW(w: number, align: Align): number {
    if (align === "left") return this.m.left;
    if (align === "right") return this.pageW - this.m.right - w;
    return this.m.left + (this.contentW - w) / 2;
  }

  /**
   * Resolve a font selection to its PDF resource name + BaseFont, registering
   * any non-default font on first use. Helvetica regular/bold keep the built-in
   * F1/F2 resources so existing output is byte-identical.
   */
  private resolveFont(spec: FontSpec): { res: string; family: FontFamily; bold: boolean; italic: boolean } {
    const family = spec.family ?? "helvetica";
    const bold = spec.bold ?? false;
    const italic = spec.italic ?? false;
    if (family === "helvetica" && !italic) {
      return { res: bold ? "F2" : "F1", family, bold, italic };
    }
    const base = baseFontName(family, bold, italic);
    let res = this.fontReg.get(base);
    if (!res) {
      res = `F${3 + this.fontReg.size}`;
      this.fontReg.set(base, res);
    }
    return { res, family, bold, italic };
  }

  /** Width (points) of a string in a resolved font. Helvetica reuses the fast path. */
  private widthOf(str: string, size: number, f: { family: FontFamily; bold: boolean; italic: boolean }): number {
    if (f.family === "helvetica") return textWidth(str, size, f.bold); // oblique shares widths
    let w = 0;
    for (const b of toBytes(str)) w += glyphWidth(b, f.family, f.bold, f.italic);
    return (w * size) / 1000;
  }

  private drawAt(x: number, baseline: number, text: string, size: number, bold: boolean, color: RGB, res?: string): void {
    const font = res ?? (bold ? "F2" : "F1");
    this.op(`BT /${font} ${size} Tf ${rgb(color)} rg 1 0 0 1 ${n2(x)} ${n2(baseline)} Tm (${pdfEscape(text)}) Tj ET\n`);
  }

  /** Draw a single line of text (no wrapping). */
  text(str: string, o: TextOptions = {}): this {
    const size = o.size ?? this.base;
    const f = this.resolveFont(o);
    const color = o.color ?? this.ink;
    const align = o.align ?? "left";
    const lh = size * 1.35;
    this.ensure(lh);
    const x = this.xForW(this.widthOf(str, size, f), align);
    this.drawAt(x, this.y - size, str, size, f.bold, color, f.res);
    this.y -= lh + (o.gap ?? 0);
    return this;
  }

  /** A section heading (accent colour, larger, bold). */
  heading(str: string, o: TextOptions = {}): this {
    this.spacer(4);
    return this.text(str, { size: o.size ?? this.base + 6, bold: true, color: o.color ?? this.accent, align: o.align, gap: o.gap ?? 3 });
  }

  /** A wrapped paragraph. */
  paragraph(str: string, o: TextOptions = {}): this {
    const size = o.size ?? this.base;
    const f = this.resolveFont(o);
    const color = o.color ?? this.ink;
    const align = o.align ?? "left";
    const measure = f.family === "helvetica" ? undefined : (s: string) => this.widthOf(s, size, f);
    for (const line of wrapText(str, size, f.bold, this.contentW, measure)) {
      const lh = size * 1.4;
      this.ensure(lh);
      const x = this.xForW(this.widthOf(line, size, f), align);
      this.drawAt(x, this.y - size, line, size, f.bold, color, f.res);
      this.y -= lh;
    }
    this.y -= o.gap ?? size * 0.5;
    return this;
  }

  /** A bullet list item (wrapped, hanging indent). */
  bullet(str: string, o: TextOptions = {}): this {
    const size = o.size ?? this.base;
    const f = this.resolveFont({ family: o.family, italic: o.italic });
    const color = o.color ?? this.ink;
    const indent = size * 1.4;
    const measure = f.family === "helvetica" ? undefined : (s: string) => this.widthOf(s, size, f);
    const lines = wrapText(str, size, false, this.contentW - indent, measure);
    lines.forEach((line, i) => {
      const lh = size * 1.4;
      this.ensure(lh);
      if (i === 0) this.drawAt(this.m.left, this.y - size, "•", size, false, this.accent);
      this.drawAt(this.m.left + indent, this.y - size, line, size, false, color, f.res);
      this.y -= lh;
    });
    this.y -= o.gap ?? 2;
    return this;
  }

  /** A label + value row (label left/muted, value right/bold). */
  keyValue(label: string, value: string, o: { size?: number } = {}): this {
    const size = o.size ?? this.base;
    const lh = size * 1.4;
    this.ensure(lh);
    this.drawAt(this.m.left, this.y - size, label, size, false, this.muted);
    const vw = textWidth(value, size, true);
    this.drawAt(this.pageW - this.m.right - vw, this.y - size, value, size, true, this.ink);
    this.y -= lh;
    return this;
  }

  /** Vertical space (points). */
  spacer(pts: number): this { this.y -= pts; return this; }

  /** A horizontal rule across the content width. */
  divider(o: { color?: RGB; width?: number } = {}): this {
    this.ensure(8);
    this.y -= 4;
    this.op(`${rgb(o.color ?? [0.88, 0.9, 0.93])} RG ${o.width ?? 0.6} w ${n2(this.m.left)} ${n2(this.y)} m ${n2(this.pageW - this.m.right)} ${n2(this.y)} l S\n`);
    this.y -= 8;
    return this;
  }

  private fillRect(x: number, yBottom: number, w: number, h: number, color: RGB): void {
    this.op(`${rgb(color)} rg ${n2(x)} ${n2(yBottom)} ${n2(w)} ${n2(h)} re f\n`);
  }

  /** Render a table with headers, wrapped cells and auto page-breaks. */
  table(t: TableOptions): this {
    const size = t.fontSize ?? this.base;
    const cols = t.columns.map((c) => ({ ...c, w: c.width <= 1 ? c.width * this.contentW : c.width }));
    const pad = 5;
    const headerColor = t.headerColor ?? this.accent;
    const borderColor = t.borderColor ?? [0.8, 0.83, 0.87];
    // Column boundary x-positions (for optional grid borders).
    const xs: number[] = [this.m.left];
    for (const c of cols) xs.push(xs[xs.length - 1]! + c.w);
    const xRight = xs[xs.length - 1]!;

    const drawHeader = (): void => {
      const lh = size * 1.5;
      this.ensure(lh);
      let x = this.m.left;
      for (const c of cols) {
        const tx = c.align === "right" ? x + c.w - pad - textWidth(c.header, size, true)
          : c.align === "center" ? x + (c.w - textWidth(c.header, size, true)) / 2
          : x + pad;
        this.drawAt(tx, this.y - size, c.header, size, true, headerColor);
        x += c.w;
      }
      this.y -= lh * 0.6;
      this.op(`${rgb([0.8, 0.83, 0.87])} RG 0.8 w ${n2(this.m.left)} ${n2(this.y)} m ${n2(this.pageW - this.m.right)} ${n2(this.y)} l S\n`);
      this.y -= lh * 0.4;
    };

    drawHeader();
    let r = 0;
    for (const row of t.rows) {
      // wrap each cell, row height = tallest cell
      const cellLines = cols.map((c, i) => wrapText(String(row[i] ?? ""), size, false, c.w - pad * 2));
      const rowLines = Math.max(1, ...cellLines.map((l) => l.length));
      const rowH = rowLines * size * 1.35 + 4;
      if (this.y - rowH < this.m.bottom) { this.addPage(); drawHeader(); }
      if (t.zebra && r % 2 === 1) this.fillRect(this.m.left, this.y - rowH + 2, this.contentW, rowH, [0.97, 0.98, 0.99]);
      const rowTop = this.y;
      let x = this.m.left;
      cols.forEach((c, i) => {
        cellLines[i]!.forEach((line, li) => {
          const baseline = rowTop - size - li * size * 1.35;
          const tx = c.align === "right" ? x + c.w - pad - textWidth(line, size, false)
            : c.align === "center" ? x + (c.w - textWidth(line, size, false)) / 2
            : x + pad;
          this.drawAt(tx, baseline, line, size, false, this.ink);
        });
        x += c.w;
      });
      if (t.border) {
        const top = rowTop, bot = rowTop - rowH;
        let seg = `${rgb(borderColor)} RG 0.6 w `;
        seg += `${n2(this.m.left)} ${n2(top)} m ${n2(xRight)} ${n2(top)} l S `;
        seg += `${n2(this.m.left)} ${n2(bot)} m ${n2(xRight)} ${n2(bot)} l S `;
        for (const xb of xs) seg += `${n2(xb)} ${n2(top)} m ${n2(xb)} ${n2(bot)} l S `;
        this.op(seg + "\n");
      }
      this.y -= rowH;
      r++;
    }
    return this;
  }

  /**
   * Draw an embedded image (see {@link jpegImage} / {@link rgbImage}) at the
   * current cursor. Sizing: give `width` and/or `height` in points; a single
   * dimension keeps the aspect ratio; neither uses the pixel size (capped to the
   * content width).
   */
  image(img: EmbeddedImage, opts: ImageOptions = {}): this {
    this.images.push(img);
    const name = `Im${this.images.length}`;
    const ratio = img.height / img.width;
    let w: number;
    let h: number;
    if (opts.width == null && opts.height == null) {
      w = Math.min(img.width, this.contentW);
      h = w * ratio;
    } else if (opts.width == null) {
      h = opts.height!;
      w = h / ratio;
    } else if (opts.height == null) {
      w = opts.width;
      h = w * ratio;
    } else {
      w = opts.width;
      h = opts.height;
    }
    this.ensure(h);
    const x = opts.x ?? this.xForW(w, opts.align ?? "left");
    const yBottom = this.y - h;
    this.op(`q ${n2(w)} 0 0 ${n2(h)} ${n2(x)} ${n2(yBottom)} cm /${name} Do Q\n`);
    this.y -= h + (opts.gap ?? 0);
    return this;
  }

  /**
   * Add a repeating footer (drawn in the bottom margin of every page at output
   * time). Use `{page}` / `{pages}` placeholders, or a custom `render`.
   */
  footer(o: FooterOptions = {}): this {
    this.footerCfg = o;
    return this;
  }

  /** Shorthand for a centred `"{page} / {pages}"` footer. */
  pageNumbers(o: FooterOptions = {}): this {
    this.footerCfg = { text: "{page} / {pages}", align: "center", ...o };
    return this;
  }

  /**
   * Record a PDF outline (bookmark) pointing at the current position. `level`
   * (0-based) nests entries; the tree is emitted at output time.
   */
  outlineItem(title: string, o: { level?: number } = {}): this {
    this.outline.push({ title, level: o.level ?? 0, page: this.pages.length, y: this.y });
    return this;
  }

  private footerOp(page: number, total: number): string {
    const cfg = this.footerCfg!;
    const size = cfg.size ?? 9;
    const f = this.resolveFont({ family: cfg.family, bold: cfg.bold });
    const color = cfg.color ?? this.muted;
    const raw = cfg.render ? cfg.render(page, total) : (cfg.text ?? "{page} / {pages}");
    const txt = raw.replace(/\{page\}/g, String(page)).replace(/\{pages\}/g, String(total));
    const w = this.widthOf(txt, size, f);
    const align = cfg.align ?? "center";
    const x = align === "left" ? this.m.left
      : align === "right" ? this.pageW - this.m.right - w
      : this.m.left + (this.contentW - w) / 2;
    const baseline = this.m.bottom / 2;
    return `BT /${f.res} ${size} Tf ${rgb(color)} rg 1 0 0 1 ${n2(x)} ${n2(baseline)} Tm (${pdfEscape(txt)}) Tj ET\n`;
  }

  /** Finished PDF as raw bytes. */
  toBytes(): Uint8Array {
    let pageStreams = [...this.pages, this.cur];
    // Drop a trailing empty page (e.g. from a final addPage()); always keep at
    // least one page so an empty document still renders.
    if (pageStreams.length > 1 && pageStreams[pageStreams.length - 1] === "") pageStreams.pop();
    if (this.footerCfg) {
      const total = pageStreams.length;
      pageStreams = pageStreams.map((s, i) => s + this.footerOp(i + 1, total));
    }
    const extraFonts = [...this.fontReg].map(([base, res]) => ({ base, res }));
    return assemble(pageStreams, this.pageW, this.pageH, this.meta, {
      extraFonts,
      images: this.images,
      outline: this.outline,
      mLeft: this.m.left,
    });
  }

  /** Finished PDF as a base64 string. */
  toBase64(): string {
    return bytesToBase64(this.toBytes());
  }

  /** Finished PDF as a `data:application/pdf;base64,…` URI. */
  toDataUri(): string {
    return `data:application/pdf;base64,${this.toBase64()}`;
  }
}

/* ------------------------------------------------------------------ *
 * Text wrapping
 * ------------------------------------------------------------------ */

function wrapText(
  text: string,
  size: number,
  bold: boolean,
  maxWidth: number,
  measure?: (s: string) => number,
): string[] {
  const width = measure ?? ((s: string) => textWidth(s, size, bold));
  const out: string[] = [];
  for (const rawLine of String(text).split("\n")) {
    const words = rawLine.split(/(\s+)/).filter((w) => w.length && !/^\s+$/.test(w));
    if (words.length === 0) { out.push(""); continue; }
    let cur = "";
    for (const word of words) {
      const trial = cur ? `${cur} ${word}` : word;
      if (width(trial) <= maxWidth || !cur) {
        // break a single over-long word by characters
        if (!cur && width(word) > maxWidth) {
          let chunk = "";
          for (const ch of word) {
            if (width(chunk + ch) > maxWidth && chunk) { out.push(chunk); chunk = ch; }
            else chunk += ch;
          }
          cur = chunk;
        } else {
          cur = trial;
        }
      } else {
        out.push(cur);
        cur = word;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Low-level PDF assembly (byte-accurate xref; latin1 throughout)
 * ------------------------------------------------------------------ */

interface AssembleExtras {
  /** Extra (non-Helvetica-regular/-bold) fonts, in resource-name order. */
  extraFonts: { base: string; res: string }[];
  /** Embedded images, in `Im1..ImN` order. */
  images: EmbeddedImage[];
  /** Outline (bookmark) entries in document order. */
  outline: OutlineEntry[];
  /** Left margin — used as the horizontal target of outline destinations. */
  mLeft: number;
}

/** One outline object, once object numbers + tree links are resolved. */
interface OutlineNode {
  title: string;
  num: number;
  pageObj: number;
  y: number;
  parent: number; // index into the node array, or -1 for a root
  prev: number;
  next: number;
  first: number;
  last: number;
  count: number; // descendant count (all open → positive)
}

/**
 * Resolve the flat `outline` list into a linked bookmark tree (Parent/First/
 * Last/Prev/Next/Count) keyed by level, ready to emit as PDF objects.
 */
function buildOutlineTree(entries: OutlineEntry[], itemBase: number, pageBase: number): {
  nodes: OutlineNode[];
  roots: number[];
} {
  const nodes: OutlineNode[] = entries.map((e, i) => ({
    title: e.title,
    num: itemBase + i,
    pageObj: pageBase + e.page,
    y: e.y,
    parent: -1, prev: -1, next: -1, first: -1, last: -1, count: 0,
  }));
  const roots: number[] = [];
  const stack: number[] = []; // open ancestors, by level
  for (let i = 0; i < entries.length; i++) {
    const lvl = entries[i]!.level;
    while (stack.length && entries[stack[stack.length - 1]!]!.level >= lvl) stack.pop();
    if (stack.length) {
      const p = stack[stack.length - 1]!;
      nodes[i]!.parent = p;
      if (nodes[p]!.first === -1) nodes[p]!.first = i;
      else { nodes[i]!.prev = nodes[p]!.last; nodes[nodes[p]!.last]!.next = i; }
      nodes[p]!.last = i;
    } else {
      if (roots.length) { nodes[i]!.prev = roots[roots.length - 1]!; nodes[roots[roots.length - 1]!]!.next = i; }
      roots.push(i);
    }
    stack.push(i);
  }
  // Descendant counts (reverse pass so children accumulate into parents).
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i]!.parent !== -1) nodes[nodes[i]!.parent!]!.count += nodes[i]!.count + 1;
  }
  return { nodes, roots };
}

function assemble(
  pageStreams: string[],
  pageW: number,
  pageH: number,
  meta: { title?: string; author?: string; subject?: string; keywords?: string[] },
  extras: AssembleExtras,
): Uint8Array {
  const { extraFonts, images, outline, mLeft } = extras;
  const offsets: number[] = [];
  let pdf = "";
  const push = (s: string): void => { pdf += s; };
  const pushBytes = (data: Uint8Array): void => {
    let s = "";
    // Chunk to avoid blowing the argument limit of String.fromCharCode.
    for (let i = 0; i < data.length; i += 8192) {
      s += String.fromCharCode(...data.subarray(i, i + 8192));
    }
    pdf += s;
  };
  const obj = (nn: number, body: string): void => { offsets[nn] = pdf.length; push(body); };
  const str = (s: string): string => `(${pdfEscape(s)})`;

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  const N = pageStreams.length;
  const contentBase = 5;
  const pageBase = contentBase + N;
  const infoNum = pageBase + N;

  // New objects live AFTER the Info dict so that, when there are no extra fonts,
  // images or outline entries, the byte output is identical to earlier versions.
  const EF = extraFonts.length;
  const II = images.length;
  const OL = outline.length;
  const fontObjBase = infoNum + 1;      // extra font objects
  const imgObjBase = fontObjBase + EF;  // image XObject objects
  const outlineDictNum = OL ? imgObjBase + II : 0;
  const outlineItemBase = outlineDictNum + 1;

  const catalogExtra = OL ? ` /Outlines ${outlineDictNum} 0 R` : "";
  obj(1, `1 0 obj\n<< /Type /Catalog /Pages 2 0 R${catalogExtra} /Lang (en) >>\nendobj\n`);
  const kids = Array.from({ length: N }, (_, i) => `${pageBase + i} 0 R`).join(" ");
  obj(2, `2 0 obj\n<< /Type /Pages /Count ${N} /Kids [ ${kids} ] >>\nendobj\n`);
  obj(3, `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`);
  obj(4, `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`);

  pageStreams.forEach((stream, i) => {
    const nn = contentBase + i;
    offsets[nn] = pdf.length;
    push(`${nn} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`);
  });

  // Shared /Resources fragment (all extra fonts + images are visible to every
  // page). With no extras this is byte-identical to the original page dict.
  let fontEntries = "/F1 3 0 R /F2 4 0 R";
  extraFonts.forEach((f, i) => { fontEntries += ` /${f.res} ${fontObjBase + i} 0 R`; });
  const xobj = II
    ? " /XObject << " + images.map((_, i) => `/Im${i + 1} ${imgObjBase + i} 0 R`).join(" ") + " >>"
    : "";
  const resources = `/Resources << /Font << ${fontEntries} >>${xobj} >>`;

  for (let i = 0; i < N; i++) {
    const nn = pageBase + i;
    obj(nn,
      `${nn} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] ` +
      `${resources} /Contents ${contentBase + i} 0 R >>\nendobj\n`);
  }

  const kw = (meta.keywords ?? []).join(", ");
  const d = new Date();
  const p = (x: number): string => String(x).padStart(2, "0");
  const date = `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  obj(infoNum,
    `${infoNum} 0 obj\n<< /Title ${str(meta.title ?? "Document")} /Author ${str(meta.author ?? "")} ` +
    `/Subject ${str(meta.subject ?? "")} /Keywords ${str(kw)} /Creator (Lacspace PDF) /Producer (@lacspace/pdf) ` +
    `/CreationDate (${date}) /ModDate (${date}) >>\nendobj\n`);

  // Extra font objects (standard-14, no embedded file).
  extraFonts.forEach((f, i) => {
    const nn = fontObjBase + i;
    obj(nn, `${nn} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /${f.base} /Encoding /WinAnsiEncoding >>\nendobj\n`);
  });

  // Image XObjects — JPEG via DCTDecode (bytes copied verbatim), raw pixels uncompressed.
  images.forEach((img, i) => {
    const nn = imgObjBase + i;
    const filter = img.kind === "jpeg" ? " /Filter /DCTDecode" : "";
    offsets[nn] = pdf.length;
    push(
      `${nn} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} ` +
      `/ColorSpace /${img.colorSpace} /BitsPerComponent ${img.bits}${filter} /Length ${img.data.length} >>\nstream\n`,
    );
    pushBytes(img.data);
    push(`\nendstream\nendobj\n`);
  });

  // Outline (bookmark) tree.
  let lastObj = Math.max(infoNum, imgObjBase + II - 1);
  if (OL) {
    const { nodes, roots } = buildOutlineTree(outline, outlineItemBase, pageBase);
    const totalRootCount = roots.reduce((s, r) => s + nodes[r]!.count + 1, 0);
    obj(outlineDictNum,
      `${outlineDictNum} 0 obj\n<< /Type /Outlines /Count ${totalRootCount}` +
      (roots.length ? ` /First ${nodes[roots[0]!]!.num} 0 R /Last ${nodes[roots[roots.length - 1]!]!.num} 0 R` : "") +
      ` >>\nendobj\n`);
    for (const nd of nodes) {
      const parentRef = nd.parent === -1 ? outlineDictNum : nodes[nd.parent]!.num;
      let body = `${nd.num} 0 obj\n<< /Title ${str(nd.title)} /Parent ${parentRef} 0 R`;
      if (nd.prev !== -1) body += ` /Prev ${nodes[nd.prev]!.num} 0 R`;
      if (nd.next !== -1) body += ` /Next ${nodes[nd.next]!.num} 0 R`;
      if (nd.first !== -1) body += ` /First ${nodes[nd.first]!.num} 0 R /Last ${nodes[nd.last]!.num} 0 R /Count ${nd.count}`;
      body += ` /Dest [${nd.pageObj} 0 R /XYZ ${n2(mLeft)} ${n2(nd.y)} 0] >>\nendobj\n`;
      obj(nd.num, body);
    }
    lastObj = outlineItemBase + nodes.length - 1;
  }

  const xrefPos = pdf.length;
  const count = lastObj;
  let xref = `xref\n0 ${count + 1}\n0000000000 65535 f \n`;
  for (let nn = 1; nn <= count; nn++) xref += String(offsets[nn] ?? 0).padStart(10, "0") + " 00000 n \n";
  push(xref);
  push(`trailer\n<< /Size ${count + 1} /Root 1 0 R /Info ${infoNum} 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!, b1 = bytes[i + 1], b2 = bytes[i + 2];
    const t = (b0 << 16) | ((b1 ?? 0) << 8) | (b2 ?? 0);
    out += B64[(t >> 18) & 63]! + B64[(t >> 12) & 63]!;
    out += b1 === undefined ? "=" : B64[(t >> 6) & 63]!;
    out += b2 === undefined ? "=" : B64[t & 63]!;
  }
  return out;
}

/** Format a number as money, e.g. formatMoney(1234.5, "$") → "$1,234.50". */
export function formatMoney(amount: number, currency = "$", decimals = 2): string {
  const neg = amount < 0;
  const fixed = Math.abs(amount).toFixed(decimals);
  const [int, frac] = fixed.split(".");
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = frac ? `${grouped}.${frac}` : grouped;
  const sym = /^[A-Z]{3}$/.test(currency) ? `${currency} ` : currency;
  return `${neg ? "-" : ""}${sym}${body}`;
}

/* ------------------------------------------------------------------ *
 * Batteries: invoice()
 * ------------------------------------------------------------------ */

export interface Party {
  name: string;
  /** Address / contact lines. */
  lines?: string[];
  email?: string;
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  rate: number;
  /** Line total. Computed as quantity × rate when omitted. */
  amount?: number;
}

export interface InvoiceData {
  /** Heading, default "INVOICE". */
  title?: string;
  number: string;
  date?: string;
  dueDate?: string;
  from: Party;
  to: Party;
  items: InvoiceItem[];
  /** Currency symbol ("$", "£") or 3-letter code ("USD"). Default "$". */
  currency?: string;
  /** Tax percentage applied to the subtotal. */
  taxRate?: number;
  /** Flat discount subtracted from the subtotal. */
  discount?: number;
  notes?: string;
  accent?: RGB;
  /** Company/brand name shown top-left as a wordmark. */
  brand?: string;
}

/** Generate a professional invoice PDF. Returns raw bytes. */
export function invoice(data: InvoiceData): Uint8Array {
  const cur = data.currency ?? "$";
  const doc = new PdfDocument({
    accent: data.accent,
    title: `${data.title ?? "Invoice"} ${data.number}`,
    author: data.from.name,
    subject: `Invoice for ${data.to.name}`,
  });
  const m = money(cur);

  // Header: brand + big title
  if (data.brand) doc.text(data.brand, { size: 18, bold: true, color: data.accent ?? DEFAULT_ACCENT });
  doc.text(data.title ?? "INVOICE", { size: 26, bold: true, align: "right", color: data.accent ?? DEFAULT_ACCENT });
  doc.text(`#${data.number}`, { size: 11, align: "right", color: DEFAULT_MUTED, gap: 6 });
  doc.divider();

  // From / To + meta
  doc.spacer(4);
  doc.text("FROM", { size: 8, bold: true, color: DEFAULT_MUTED });
  doc.text(data.from.name, { size: 12, bold: true });
  for (const l of data.from.lines ?? []) doc.text(l, { size: 10, color: DEFAULT_MUTED });
  if (data.from.email) doc.text(data.from.email, { size: 10, color: DEFAULT_MUTED });
  doc.spacer(8);
  doc.text("BILL TO", { size: 8, bold: true, color: DEFAULT_MUTED });
  doc.text(data.to.name, { size: 12, bold: true });
  for (const l of data.to.lines ?? []) doc.text(l, { size: 10, color: DEFAULT_MUTED });
  if (data.to.email) doc.text(data.to.email, { size: 10, color: DEFAULT_MUTED });
  doc.spacer(10);

  if (data.date) doc.keyValue("Issued", data.date);
  if (data.dueDate) doc.keyValue("Due", data.dueDate);
  doc.spacer(8);

  // Items table
  const rows = data.items.map((it) => {
    const amt = it.amount ?? it.quantity * it.rate;
    return [it.description, String(it.quantity), m(it.rate), m(amt)];
  });
  doc.table({
    columns: [
      { header: "Description", width: 0.5 },
      { header: "Qty", width: 0.13, align: "right" },
      { header: "Rate", width: 0.18, align: "right" },
      { header: "Amount", width: 0.19, align: "right" },
    ],
    rows,
    zebra: true,
  });

  // Totals
  const subtotal = data.items.reduce((s, it) => s + (it.amount ?? it.quantity * it.rate), 0);
  const discount = data.discount ?? 0;
  const taxable = subtotal - discount;
  const tax = data.taxRate ? (taxable * data.taxRate) / 100 : 0;
  const total = taxable + tax;

  doc.spacer(6);
  doc.divider();
  doc.keyValue("Subtotal", m(subtotal));
  if (discount) doc.keyValue("Discount", `-${m(discount)}`);
  if (data.taxRate) doc.keyValue(`Tax (${data.taxRate}%)`, m(tax));
  doc.spacer(2);
  doc.text(`Total   ${m(total)}`, { size: 15, bold: true, align: "right", color: data.accent ?? DEFAULT_ACCENT, gap: 6 });

  if (data.notes) {
    doc.spacer(10);
    doc.text("NOTES", { size: 8, bold: true, color: DEFAULT_MUTED });
    doc.paragraph(data.notes, { size: 10, color: DEFAULT_MUTED });
  }
  return doc.toBytes();
}

/* ------------------------------------------------------------------ *
 * Batteries: receipt()
 * ------------------------------------------------------------------ */

export interface ReceiptData {
  title?: string;
  brand?: string;
  number?: string;
  date?: string;
  items: { name: string; quantity?: number; amount: number }[];
  currency?: string;
  taxRate?: number;
  paymentMethod?: string;
  footer?: string;
  accent?: RGB;
}

/**
 * Generate a receipt-style PDF. Returns raw bytes.
 *
 * Rendered on a standard A4 page (not a narrow 80mm thermal roll) with a
 * centered, receipt-style layout: small font, tight margins, centered header,
 * item rows and totals. Prints cleanly on any office printer.
 */
export function receipt(data: ReceiptData): Uint8Array {
  const cur = data.currency ?? "$";
  const m = money(cur);
  // A4 page with a small font and tight margins for a compact receipt layout.
  const doc = new PdfDocument({
    margins: 14,
    fontSize: 9,
    accent: data.accent,
    title: `${data.title ?? "Receipt"}${data.number ? ` ${data.number}` : ""}`,
  });
  doc.text(data.brand ?? data.title ?? "RECEIPT", { size: 15, bold: true, align: "center", color: data.accent ?? DEFAULT_ACCENT });
  if (data.title && data.brand) doc.text(data.title, { size: 9, align: "center", color: DEFAULT_MUTED });
  if (data.number) doc.text(`#${data.number}`, { size: 9, align: "center", color: DEFAULT_MUTED });
  if (data.date) doc.text(data.date, { size: 9, align: "center", color: DEFAULT_MUTED });
  doc.spacer(4);
  doc.divider();

  for (const it of data.items) {
    const label = it.quantity && it.quantity > 1 ? `${it.name}  x${it.quantity}` : it.name;
    doc.keyValue(label, m(it.amount), { size: 10 });
  }
  doc.divider();

  const subtotal = data.items.reduce((s, it) => s + it.amount, 0);
  const tax = data.taxRate ? (subtotal * data.taxRate) / 100 : 0;
  if (data.taxRate) {
    doc.keyValue("Subtotal", m(subtotal), { size: 10 });
    doc.keyValue(`Tax (${data.taxRate}%)`, m(tax), { size: 10 });
  }
  doc.text(`Total   ${m(subtotal + tax)}`, { size: 13, bold: true, align: "right", color: data.accent ?? DEFAULT_ACCENT, gap: 4 });
  if (data.paymentMethod) doc.keyValue("Paid via", data.paymentMethod, { size: 10 });
  if (data.footer) {
    doc.spacer(8);
    doc.paragraph(data.footer, { size: 9, color: DEFAULT_MUTED, align: "center" });
  }
  return doc.toBytes();
}

function money(currency: string): (n: number) => string {
  return (n: number) => formatMoney(n, currency);
}
