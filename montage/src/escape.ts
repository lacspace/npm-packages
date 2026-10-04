// Escaping helpers for ffmpeg filtergraphs. A drawtext value passes through three parsers,
// innermost first:
//  3) drawtext text expansion: `\` and `%` are special.
//  2) filter-option parsing (key=value:key=value): `\`, `'` and `:` are special.
//  1) filtergraph parsing: the value sits inside '…' here, where nothing is special except
//     the closing quote, and a backslash does NOT escape a quote. A literal quote has to
//     close the string, be backslash-escaped, then reopen: '\''.
// Both helpers return text meant to sit INSIDE single quotes: text='${escapeDrawtext(s)}'.

/** Level 2 escape (option value), then make the result safe inside a level-1 '…' string. */
function quoteSafe(level2: string): string {
  return level2
    .replace(/[\\':]/g, (c) => "\\" + c)
    // The option parser trims unescaped edge whitespace; escape it so padding survives.
    .replace(/^\s+|\s+$/g, (ws) => ws.replace(/./gsu, (c) => "\\" + c))
    .replace(/'/g, "'\\''");
}

/** Escape a string for use as a drawtext `text=` value inside single quotes: text='…'. */
export function escapeDrawtext(s: string): string {
  const expanded = s.replace(/\r\n?/g, "\n").replace(/[\\%]/g, (c) => "\\" + c);
  return quoteSafe(expanded);
}

/** Escape a filesystem path used as a quoted filter option value: fontfile='…', subtitles='…'. */
export function escapePath(p: string): string {
  return quoteSafe(p.replace(/\\/g, "/"));
}

/** A hex/rgba color passed through unchanged after a light validation. */
export function color(c: string): string {
  return /^#?[0-9a-fA-F]{3,8}$|^[a-zA-Z]+(@[0-9.]+)?$|^0x/.test(c) ? c : "white";
}
