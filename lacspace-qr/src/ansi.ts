/**
 * Render a QR code to the terminal using full block characters — two glyphs per
 * module so the result stays square and scans cleanly straight off the screen.
 * Dark modules become solid blocks and light modules become spaces (the correct
 * polarity for a light background / most scanners); `invert` swaps them, and the
 * quiet zone is always drawn light. Unlike {@link renderToTerminal} (which packs
 * two module rows into one text line with half-blocks) this keeps one module per
 * cell, which some terminals and scanner cameras prefer. Zero dependencies.
 */
import type { QrCode } from "./matrix.js";

export interface AnsiOptions {
  /** Quiet-zone margin in modules (default 2). */
  margin?: number;
  /** Swap dark/light rendering (for dark-background terminals). */
  invert?: boolean;
  /** Two-character glyph for a dark module (default "██"). */
  dark?: string;
  /** Two-character glyph for a light module (default two spaces). */
  light?: string;
}

/** Return the QR as a multi-line string of full-block characters (2 chars/module). */
export function renderToAnsi(qr: QrCode, opts: AnsiOptions = {}): string {
  const margin = opts.margin ?? 2;
  const invert = opts.invert ?? false;
  const darkGlyph = opts.dark ?? "██";
  const lightGlyph = opts.light ?? "  ";
  const size = qr.size;
  const total = size + margin * 2;

  const dark = (x: number, y: number): boolean => {
    const mx = x - margin;
    const my = y - margin;
    if (mx < 0 || my < 0 || mx >= size || my >= size) return false; // quiet zone is light
    return qr.modules[my]![mx]!;
  };

  const lines: string[] = [];
  for (let y = 0; y < total; y++) {
    let line = "";
    for (let x = 0; x < total; x++) {
      const on = invert ? !dark(x, y) : dark(x, y);
      line += on ? darkGlyph : lightGlyph;
    }
    lines.push(line);
  }
  return lines.join("\n");
}
