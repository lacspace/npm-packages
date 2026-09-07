/**
 * Render a QR code to the terminal using Unicode half-block characters, so each
 * text row carries two module rows and the result stays close to square and
 * scannable straight off the screen. Light modules are drawn as bright blocks
 * (the terminal foreground) and dark modules as empty space — the correct
 * polarity for a dark-background terminal. `invert` swaps them.
 */
import type { QrCode } from "./matrix.js";

export interface TerminalOptions {
  /** Quiet-zone margin in modules (default 2). */
  margin?: number;
  /** Swap dark/light rendering (for light-background terminals). */
  invert?: boolean;
}

/** Return the QR as a multi-line string of half-block characters. */
export function renderToTerminal(qr: QrCode, opts: TerminalOptions = {}): string {
  const margin = opts.margin ?? 2;
  const invert = opts.invert ?? false;
  const size = qr.size;
  const total = size + margin * 2;

  // dark(x,y): true if the module at padded coord is a dark QR module.
  const dark = (x: number, y: number): boolean => {
    const mx = x - margin;
    const my = y - margin;
    if (mx < 0 || my < 0 || mx >= size || my >= size) return false; // quiet zone is light
    return qr.modules[my]![mx]!;
  };

  // "on" = the bright/filled half of the glyph. By default the light modules
  // are filled; invert flips that.
  const on = (x: number, y: number): boolean => (invert ? dark(x, y) : !dark(x, y));

  const lines: string[] = [];
  for (let y = 0; y < total; y += 2) {
    let line = "";
    for (let x = 0; x < total; x++) {
      const top = on(x, y);
      const bottom = on(x, y + 1); // dark() treats out-of-range as light quiet zone
      if (top && bottom) line += "█"; // █
      else if (top && !bottom) line += "▀"; // ▀
      else if (!top && bottom) line += "▄"; // ▄
      else line += " ";
    }
    lines.push(line);
  }
  return lines.join("\n");
}
