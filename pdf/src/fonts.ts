/**
 * Metrics + names for the PDF standard-14 text fonts, so text drawn in any of
 * the Helvetica / Times / Courier families measures correctly (accurate
 * wrapping & alignment) with **zero dependencies**.
 *
 * Helvetica (regular/bold) metrics live in `index.ts` and are the default —
 * this module only supplies the *additional* families so the default output is
 * untouched. Helvetica-Oblique / Helvetica-BoldOblique share Helvetica widths.
 */

/** A standard-14 text font family. */
export type FontFamily = "helvetica" | "times" | "courier";

/** A font selection: family + optional bold/italic. */
export interface FontSpec {
  family?: FontFamily;
  bold?: boolean;
  italic?: boolean;
}

// AFM advance widths (1000-unit em) for WinAnsi codes 32..126.
const parse = (s: string): number[] => s.trim().split(/\s+/).map(Number);

const TIMES_ROMAN = parse(`
250 333 408 500 500 833 778 180 333 333 500 564 250 333 250 278 500 500 500 500
500 500 500 500 500 500 278 278 564 564 564 444 921 722 667 667 722 611 556 722
722 333 389 722 611 889 722 722 556 722 667 556 611 722 722 944 722 722 611 333
278 333 469 500 333 444 500 444 500 444 333 500 500 278 278 500 278 778 500 500
500 500 333 389 278 500 500 722 500 500 444 480 200 480 541`);

const TIMES_BOLD = parse(`
250 333 555 500 500 1000 833 278 333 333 500 570 250 333 250 278 500 500 500 500
500 500 500 500 500 500 333 333 570 570 570 500 930 722 667 722 722 667 611 778
778 389 500 778 667 944 722 778 611 778 722 556 667 722 722 1000 722 722 667 333
278 333 581 500 333 500 556 444 556 444 333 500 556 278 333 556 278 833 556 500
556 556 444 389 333 556 500 722 500 500 444 394 220 394 520`);

const TIMES_ITALIC = parse(`
250 333 420 500 500 833 778 214 333 333 500 675 250 333 250 278 500 500 500 500
500 500 500 500 500 500 333 333 675 675 675 500 920 611 611 667 722 611 611 722
722 333 444 667 556 833 667 722 611 722 611 500 556 722 611 833 611 556 556 389
278 389 422 500 333 500 500 444 500 444 278 500 500 278 278 444 278 722 500 500
500 500 389 389 278 500 444 667 444 444 389 400 275 400 541`);

const TIMES_BOLDITALIC = parse(`
250 389 555 500 500 833 778 278 333 333 500 570 250 333 250 278 500 500 500 500
500 500 500 500 500 500 333 333 570 570 570 500 832 667 667 667 722 667 667 722
778 389 500 667 611 889 722 722 611 722 667 556 611 722 667 889 667 611 611 333
278 333 570 500 333 500 500 444 500 444 333 500 556 278 278 500 278 778 556 500
500 500 389 389 278 556 444 667 500 444 389 348 220 348 570`);

// Times high-code (WinAnsi punctuation) advance widths, keyed by byte code.
const TIMES_HIGH: Record<number, number> = {
  0x80: 500, 0x85: 1000, 0x91: 333, 0x92: 333, 0x93: 444, 0x94: 444,
  0x95: 350, 0x96: 500, 0x97: 1000, 0xa9: 760, 0xae: 760, 0x99: 980,
};

/**
 * The PDF BaseFont name for a family + style — one of the standard-14 fonts,
 * so no font file is embedded.
 */
export function baseFontName(family: FontFamily, bold: boolean, italic: boolean): string {
  if (family === "times") {
    if (bold && italic) return "Times-BoldItalic";
    if (bold) return "Times-Bold";
    if (italic) return "Times-Italic";
    return "Times-Roman";
  }
  if (family === "courier") {
    if (bold && italic) return "Courier-BoldOblique";
    if (bold) return "Courier-Bold";
    if (italic) return "Courier-Oblique";
    return "Courier";
  }
  // helvetica
  if (bold && italic) return "Helvetica-BoldOblique";
  if (bold) return "Helvetica-Bold";
  if (italic) return "Helvetica-Oblique";
  return "Helvetica";
}

/**
 * Advance width (1000-unit em) of one WinAnsi byte code in a non-Helvetica
 * family. (Helvetica keeps its own fast path in `index.ts`.) Courier is
 * monospaced; Times uses AFM metrics.
 */
export function glyphWidth(code: number, family: FontFamily, bold: boolean, italic: boolean): number {
  if (family === "courier") return 600;
  // times
  const table = bold && italic ? TIMES_BOLDITALIC : bold ? TIMES_BOLD : italic ? TIMES_ITALIC : TIMES_ROMAN;
  if (code >= 32 && code <= 126) return table[code - 32]!;
  return TIMES_HIGH[code] ?? 500;
}
