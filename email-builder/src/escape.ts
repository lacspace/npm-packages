/**
 * Escaping that leaves mail-merge variables alone.
 *
 * A variable is `{{ ... }}` whose inside has no braces and no angle brackets:
 * `{{firstName}}`, `{{#if paid}}`, `{{/if}}`, `{{name|there}}`. Angle brackets
 * are excluded so a "variable" can never smuggle a tag into the output.
 */
export const VAR_RE = /\{\{[^{}<>]*\}\}/g;

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escRaw(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]!);
}

/** Apply `fn` to the text outside {{vars}} and `varFn` to each var. */
export function mapOutsideVars(
  s: string,
  fn: (text: string) => string,
  varFn: (v: string) => string = (v) => v,
): string {
  let out = "";
  let last = 0;
  for (const m of s.matchAll(VAR_RE)) {
    const i = m.index ?? 0;
    out += fn(s.slice(last, i)) + varFn(m[0]);
    last = i + m[0].length;
  }
  return out + fn(s.slice(last));
}

/** Escape for HTML text content; {{vars}} are left verbatim. */
export function escapeHtml(value: unknown): string {
  return mapOutsideVars(value == null ? "" : String(value), escRaw);
}

/**
 * Escape for a double-quoted attribute (`'` is left as is, so CSS font names
 * stay readable); {{vars}} are left verbatim except that a `"` inside a var
 * becomes `&quot;` so it can't end the attribute.
 */
export function escapeAttr(value: unknown): string {
  return mapOutsideVars(
    value == null ? "" : String(value),
    (t) => t.replace(/[&<>"]/g, (c) => ESC[c]!),
    (v) => v.replace(/"/g, "&quot;"),
  );
}

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  zwnj: "‌",
  middot: "·",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  copy: "©",
  reg: "®",
};

/** Decode common named and all numeric character references. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z][a-zA-Z0-9]{1,31});?/g, (m, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return m;
      try {
        return String.fromCodePoint(code);
      } catch {
        return m;
      }
    }
    const v = NAMED[body.toLowerCase()];
    return v ?? m;
  });
}

const URL_OK = /^(?:https?:\/\/[^\s"'<>\\]+|mailto:[^\s"'<>\\]+|tel:[0-9+().\-\s]+)$/i;

/**
 * True for http(s):, mailto:, tel: URLs and for URLs that start with a {{var}}
 * (e.g. `{{unsubscribeUrl}}`). Vars inside an http(s) URL are fine too.
 */
export function isSafeUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const u = value.trim();
  if (!u) return false;
  if (/^\{\{[^{}<>]*\}\}/.test(u)) return !/[<>"\s]/.test(u.replace(VAR_RE, "X"));
  return URL_OK.test(u.replace(VAR_RE, "X"));
}
