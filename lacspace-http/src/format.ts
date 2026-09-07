/**
 * Presentation helpers: a byte-size formatter, a status-code colour picker, and
 * a JSON pretty-printer with optional ANSI syntax highlighting. With `color`
 * off, {@link prettyJson} is byte-for-byte `JSON.stringify(value, null, 2)`, so
 * it stays trivially testable and pipe-safe.
 */

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
};

/** Human-readable byte size: `950 B`, `1.2 KB`, `3.4 MB`. */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${units[i]}`;
}

/** The ANSI colour name appropriate for a status code (green/cyan/yellow/red). */
export function statusColor(status: number): keyof typeof ANSI {
  if (status >= 200 && status < 300) return "green";
  if (status >= 300 && status < 400) return "cyan";
  if (status >= 400 && status < 500) return "yellow";
  return "red";
}

/** Wrap `s` in an ANSI colour when `enabled`. */
export function paint(color: keyof typeof ANSI, s: string, enabled: boolean): string {
  return enabled ? `${ANSI[color]}${s}${ANSI.reset}` : s;
}

/**
 * Pretty-print a JSON value. When `color` is false the output equals
 * `JSON.stringify(value, null, 2)`; when true, keys/strings/numbers/booleans are
 * syntax-highlighted with ANSI colours.
 */
export function prettyJson(value: unknown, color = false): string {
  const plain = JSON.stringify(value, null, 2);
  if (plain === undefined) return String(value);
  if (!color) return plain;
  return plain.replace(
    /("(?:\\.|[^"\\])*"(\s*:)?)|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match, str: string | undefined, colon: string | undefined, lit: string | undefined) => {
      if (str !== undefined) {
        if (colon) return paint("blue", str.slice(0, str.length - colon.length), true) + colon;
        return paint("green", str, true);
      }
      if (lit !== undefined) return paint("yellow", lit, true);
      return paint("cyan", match, true);
    },
  );
}

/** True if the given content-type looks like JSON. */
export function isJsonContentType(ct: string | undefined): boolean {
  return !!ct && /\bjson\b/i.test(ct);
}
