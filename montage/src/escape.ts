// Escaping helpers for ffmpeg filtergraphs. Two layers matter:
//  1) drawtext's `text=` value: backslash, colon, single-quote, percent, newline.
//  2) a filter-option value wrapped in single quotes inside the graph.

/** Escape a string for use as a drawtext `text=` value (already inside single quotes). */
export function escapeDrawtext(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\\\'")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/\r?\n/g, "\\n");
}

/** Escape a filesystem path used as a filter option value (fontfile=, movie=…). */
export function escapePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

/** A hex/rgba color passed through unchanged after a light validation. */
export function color(c: string): string {
  return /^#?[0-9a-fA-F]{3,8}$|^[a-zA-Z]+(@[0-9.]+)?$|^0x/.test(c) ? c : "white";
}
