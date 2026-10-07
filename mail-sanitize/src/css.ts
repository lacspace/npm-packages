/**
 * CSS sanitizing for inline `style` attributes and `<style>` sheets.
 *
 * Values pass an allowlist of CSS functions; every `url()` is resolved through
 * the caller's image rules; selectors are rewritten under the scope selector
 * and class/id names get the same prefix the HTML attributes get.
 */

export interface CssContext {
  scope: string;
  prefix: string;
  blockRemote: boolean;
  /** Resolve a raw url() argument: a URL to emit, or null to replace with `none`. */
  url(raw: string): string | null;
  /** Keyframe names declared by the message (renamed with the prefix). */
  keyframes: Set<string>;
}

const MAX_SELECTOR = 1000;
const MAX_DEPTH = 8;
const Z_MAX = 100;

const SAFE_FUNCS = new Set([
  "url", "rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch", "color", "color-mix",
  "calc", "min", "max", "clamp", "var", "env", "counter", "counters",
  "linear-gradient", "radial-gradient", "conic-gradient", "repeating-linear-gradient",
  "repeating-radial-gradient", "repeating-conic-gradient", "gradient",
  "rotate", "rotatex", "rotatey", "rotatez", "rotate3d", "translate", "translatex", "translatey",
  "translatez", "translate3d", "scale", "scalex", "scaley", "scalez", "scale3d", "skew", "skewx",
  "skewy", "matrix", "matrix3d", "perspective", "cubic-bezier", "steps",
  "blur", "brightness", "contrast", "drop-shadow", "grayscale", "hue-rotate", "invert", "opacity",
  "saturate", "sepia", "rect", "inset", "circle", "ellipse", "polygon", "minmax", "repeat",
  "fit-content", "local", "format", "from", "to", "color-stop",
]);

const BANNED_PROPS = new Set(["behavior", "-ms-behavior", "-moz-binding", "binding", "-webkit-binding"]);

/** Remove comments outside strings. */
export function stripCssComments(s: string): string {
  if (s.indexOf("/*") === -1) return s;
  let out = "";
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i]!;
    if (c === "\\") {
      out += s.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const e = skipString(s, i);
      out += s.slice(i, e);
      i = e;
    } else if (c === "/" && s[i + 1] === "*") {
      const e = s.indexOf("*/", i + 2);
      i = e === -1 ? n : e + 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Index just past the string starting at `i` (handles backslash escapes). */
function skipString(s: string, i: number): number {
  const q = s[i];
  let j = i + 1;
  const n = s.length;
  while (j < n) {
    const c = s[j];
    if (c === "\\") j += 2;
    else if (c === q) return j + 1;
    else if (c === "\n") return j;
    else j++;
  }
  return n;
}

/** Split on a top-level separator (outside strings, parens and brackets). */
function splitTop(s: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let last = 0;
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      i = skipString(s, i);
      continue;
    }
    if (c === "(" || c === "[") depth++;
    else if ((c === ")" || c === "]") && depth > 0) depth--;
    else if (c === sep && depth === 0) {
      parts.push(s.slice(last, i));
      last = i + 1;
    }
    i++;
  }
  parts.push(s.slice(last));
  return parts;
}

function removeStrings(s: string): string | null {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === "\\") {
      out += s.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      // Unterminated strings would swallow whatever follows in the sheet.
      let j = i + 1;
      let closed = false;
      while (j < s.length) {
        const d = s[j];
        if (d === "\\") j += 2;
        else if (d === c) {
          closed = true;
          j++;
          break;
        } else if (d === "\n") break;
        else j++;
      }
      if (!closed) return null;
      i = j;
      out += '""';
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function isIdent(c: string | undefined): boolean {
  return !!c && /[a-zA-Z0-9_-]/.test(c);
}

function escapeCssUrl(u: string): string {
  return u.replace(/["\\<>\s()']/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
}

/** Rewrite every url(...) in a value through ctx.url. Returns null when malformed. */
function rewriteUrls(v: string, ctx: CssContext): string | null {
  if (!/url\(/i.test(v)) return v;
  let out = "";
  let i = 0;
  const n = v.length;
  while (i < n) {
    const c = v[i]!;
    if (c === "\\") {
      out += v.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const e = skipString(v, i);
      out += v.slice(i, e);
      i = e;
      continue;
    }
    if ((c === "u" || c === "U") && v.slice(i, i + 4).toLowerCase() === "url(" && !isIdent(v[i - 1])) {
      let j = i + 4;
      while (j < n && /\s/.test(v[j]!)) j++;
      let raw: string;
      const q = v[j];
      if (q === '"' || q === "'") {
        const e = v.indexOf(q, j + 1);
        if (e === -1) return null;
        raw = v.slice(j + 1, e);
        j = e + 1;
        while (j < n && /\s/.test(v[j]!)) j++;
        if (v[j] !== ")") return null;
      } else {
        const e = v.indexOf(")", j);
        if (e === -1) return null;
        raw = v.slice(j, e).trim();
        if (/["'(\s]/.test(raw)) return null;
        j = e;
      }
      if (raw.indexOf("\\") !== -1) return null;
      const res = ctx.url(raw);
      out += res === null ? "none" : 'url("' + escapeCssUrl(res) + '")';
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Sanitize one declaration value. Returns null to drop the declaration. */
export function sanitizeValue(prop: string, value: string, ctx: CssContext): string | null {
  let v = value.trim();
  if (!v) return null;
  const rewritten = rewriteUrls(v, ctx);
  if (rewritten === null) return null;
  v = rewritten;
  const bare = removeStrings(v);
  if (bare === null) return null;
  // Backslash escapes outside strings can disguise function names and keywords.
  if (/[\\{};<>@`]/.test(bare)) return null;
  const lower = bare.toLowerCase();
  if (/expression|javascript:|vbscript:|livescript:|progid|-moz-binding|behavior/.test(lower)) return null;
  if (lower.includes("!") && !/^[^!]*!\s*important\s*$/.test(lower)) return null;
  const fnRe = /([a-z_-][a-z0-9_-]*)\(/g;
  let m: RegExpExecArray | null;
  while ((m = fnRe.exec(lower))) {
    const name = m[1]!.replace(/^-(?:webkit|moz|ms|o)-/, "");
    if (!SAFE_FUNCS.has(name)) return null;
  }
  if (prop === "position" && /fixed|sticky/.test(lower)) return null;
  if (prop === "z-index") {
    const z = parseInt(lower, 10);
    if (!Number.isFinite(z)) return lower.trim() === "auto" ? "auto" : null;
    return String(Math.max(-Z_MAX, Math.min(Z_MAX, z)));
  }
  if ((prop === "animation" || prop === "animation-name" || prop === "-webkit-animation" || prop === "-webkit-animation-name") && ctx.keyframes.size) {
    v = v.replace(/[-a-zA-Z_][-a-zA-Z0-9_]*/g, (w) => (ctx.keyframes.has(w) ? ctx.prefix + w : w));
  }
  return v;
}

/** Parse and sanitize a declaration list (`a:b; c:d`). Returns "a:b;c:d" (no trailing ;). */
export function sanitizeDeclarations(block: string, ctx: CssContext): string {
  const out: string[] = [];
  for (const decl of splitTop(stripCssComments(block), ";")) {
    const colon = decl.indexOf(":");
    if (colon === -1) continue;
    const prop = decl.slice(0, colon).trim().toLowerCase();
    if (!/^-?[a-z][a-z0-9-]*$/.test(prop) || prop.length > 64) continue;
    if (BANNED_PROPS.has(prop)) continue;
    const v = sanitizeValue(prop, decl.slice(colon + 1), ctx);
    if (v === null) continue;
    out.push(prop + ":" + v);
  }
  return out.join(";");
}

/** Read a style attribute's declarations into a map (lowercased, unsanitized) for heuristics. */
export function readDeclarations(block: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const decl of splitTop(stripCssComments(block), ";")) {
    const colon = decl.indexOf(":");
    if (colon === -1) continue;
    m.set(decl.slice(0, colon).trim().toLowerCase(), decl.slice(colon + 1).trim().toLowerCase());
  }
  return m;
}

/** Prefix `.class` and `#id` names in a selector (outside strings and [attr] brackets). */
function prefixSelector(sel: string, prefix: string): string {
  let out = "";
  let bracket = 0;
  let i = 0;
  while (i < sel.length) {
    const c = sel[i]!;
    if (c === "\\") {
      out += sel.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const e = skipString(sel, i);
      out += sel.slice(i, e);
      i = e;
      continue;
    }
    if (c === "[") bracket++;
    else if (c === "]" && bracket > 0) bracket--;
    out += c;
    if ((c === "." || c === "#") && bracket === 0) {
      const nx = sel[i + 1];
      if (nx && (/[a-zA-Z_\\-]/.test(nx) || nx.charCodeAt(0) > 127)) out += prefix;
    }
    i++;
  }
  return out;
}

const ROOT_RE = /^(?:html|body|:root)(?![a-zA-Z0-9_-])/i;

/** Rewrite a selector list so every selector only matches inside the scope. Null if none survive. */
export function scopeSelectors(prelude: string, ctx: CssContext): string | null {
  if (/[<{}]/.test(prelude)) return null;
  const out: string[] = [];
  for (const part of splitTop(prelude, ",")) {
    let s = part.trim();
    if (!s || s.length > MAX_SELECTOR || s.includes("&")) continue;
    // Only identifier-style escapes (Tailwind/Maizzle ".sm\\:w-full"); anything else could
    // hide structure (an escaped paren or comma) from this parser.
    if (/\\(?![a-zA-Z0-9:._\-/%@!])/.test(s)) continue;
    for (let guard = 0; guard < 8; guard++) {
      const m = ROOT_RE.exec(s);
      if (!m) break;
      s = s.slice(m[0].length).trimStart();
      if (s[0] === ">") s = s.slice(1).trimStart();
    }
    // Sibling combinators at the front would reach outside the scope element.
    if (s[0] === "~" || s[0] === "+") continue;
    if (!s) {
      out.push(ctx.scope);
      continue;
    }
    const prefixed = prefixSelector(s, ctx.prefix);
    out.push(ctx.scope + " " + prefixed);
  }
  return out.length ? out.join(", ") : null;
}

/** Index of the next top-level `{` or `;` from i (outside strings/parens). */
function scanTo(s: string, i: number, stops: string): number {
  let depth = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i]!;
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      i = skipString(s, i);
      continue;
    }
    if (c === "(" || c === "[") depth++;
    else if ((c === ")" || c === "]") && depth > 0) depth--;
    else if (depth === 0 && stops.includes(c)) return i;
    i++;
  }
  return n;
}

/** Index of the `}` matching the `{` at `open`, or s.length. */
function matchBrace(s: string, open: number): number {
  let depth = 0;
  let i = open;
  const n = s.length;
  while (i < n) {
    const c = s[i]!;
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      i = skipString(s, i);
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return n;
}

const MEDIA_PRELUDE = /^[\w\s(),:.\-/%>=*!]*$/;

function parseRules(s: string, ctx: CssContext, depth: number): string {
  const out: string[] = [];
  let i = 0;
  const n = s.length;
  while (i < n) {
    while (i < n && /[\s;}]/.test(s[i]!)) i++;
    if (i >= n) break;
    if (s[i] === "@") {
      let j = i + 1;
      while (j < n && /[-a-zA-Z0-9_]/.test(s[j]!)) j++;
      const name = s.slice(i + 1, j).toLowerCase();
      const stop = scanTo(s, j, "{;");
      if (stop >= n || s[stop] === ";") {
        // Statement at-rules (@import, @charset, @namespace, @layer a;) are dropped.
        i = stop + 1;
        continue;
      }
      const prelude = s.slice(j, stop).trim();
      const close = matchBrace(s, stop);
      const body = s.slice(stop + 1, close);
      i = close + 1;
      if ((name === "media" || name === "supports") && depth < MAX_DEPTH) {
        if (!MEDIA_PRELUDE.test(prelude)) continue;
        const inner = parseRules(body, ctx, depth + 1);
        if (inner) out.push("@" + name + " " + prelude + "{" + inner + "}");
      } else if (/^(?:-[a-z]+-)?keyframes$/.test(name)) {
        if (!/^[-a-zA-Z_][-a-zA-Z0-9_]*$/.test(prelude)) continue;
        const frames = parseKeyframes(body, ctx);
        if (frames) out.push("@" + name + " " + ctx.prefix + prelude + "{" + frames + "}");
      } else if (name === "font-face" && !ctx.blockRemote) {
        const decls = sanitizeDeclarations(body, ctx);
        if (decls) out.push("@font-face{" + decls + "}");
      }
      // Everything else (@import blocks, @page, @layer, @container, @property, @font-face when blocking…) is dropped.
      continue;
    }
    const stop = scanTo(s, i, "{");
    if (stop >= n) break;
    const prelude = s.slice(i, stop);
    const close = matchBrace(s, stop);
    const body = s.slice(stop + 1, close);
    i = close + 1;
    const sel = scopeSelectors(prelude, ctx);
    if (!sel) continue;
    const decls = sanitizeDeclarations(body, ctx);
    if (decls) out.push(sel + "{" + decls + "}");
  }
  return out.join("\n");
}

function parseKeyframes(s: string, ctx: CssContext): string {
  const out: string[] = [];
  let i = 0;
  const n = s.length;
  while (i < n) {
    while (i < n && /[\s;}]/.test(s[i]!)) i++;
    if (i >= n) break;
    const stop = scanTo(s, i, "{");
    if (stop >= n) break;
    const sel = s.slice(i, stop).trim().toLowerCase();
    const close = matchBrace(s, stop);
    const body = s.slice(stop + 1, close);
    i = close + 1;
    if (!/^(?:from|to|\d{1,3}(?:\.\d+)?%)(?:\s*,\s*(?:from|to|\d{1,3}(?:\.\d+)?%))*$/.test(sel)) continue;
    const decls = sanitizeDeclarations(body, ctx);
    out.push(sel + "{" + decls + "}");
  }
  return out.join("");
}

/** Sanitize a whole style sheet. Output never contains a literal "<". */
export function sanitizeStylesheet(css: string, ctx: CssContext): string {
  const cleaned = stripCssComments(css).replace(/<!--|-->/g, " ");
  return parseRules(cleaned, ctx, 0).replace(/</g, "\\3c ");
}

/** Keyframe names declared anywhere in the document (cheap pre-pass). */
export function collectKeyframes(html: string): Set<string> {
  const set = new Set<string>();
  if (html.indexOf("keyframes") === -1) return set;
  const re = /@(?:-[a-z]+-)?keyframes\s+([-a-zA-Z_][-a-zA-Z0-9_]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && set.size < 200) set.add(m[1]!);
  return set;
}
