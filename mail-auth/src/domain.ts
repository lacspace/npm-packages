/**
 * Domain helpers: punycode (RFC 3492) decoding, registrable-domain heuristic,
 * homoglyph skeletons and lookalike detection. No runtime dependencies.
 */

// ---------------------------------------------------------------------------
// Punycode (RFC 3492) decoding
// ---------------------------------------------------------------------------

const BASE = 36;
const T_MIN = 1;
const T_MAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;
const MAX_INT = 0x7fffffff;

function adapt(delta: number, numPoints: number, first: boolean): number {
  let d = first ? Math.floor(delta / DAMP) : delta >> 1;
  d += Math.floor(d / numPoints);
  let k = 0;
  while (d > ((BASE - T_MIN) * T_MAX) >> 1) {
    d = Math.floor(d / (BASE - T_MIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - T_MIN + 1) * d) / (d + SKEW));
}

function basicToDigit(cp: number): number {
  if (cp >= 0x30 && cp <= 0x39) return cp - 22; // 0-9 -> 26-35
  if (cp >= 0x41 && cp <= 0x5a) return cp - 0x41; // A-Z
  if (cp >= 0x61 && cp <= 0x7a) return cp - 0x61; // a-z
  return BASE;
}

function decodeRaw(input: string): string | null {
  const output: number[] = [];
  let n = INITIAL_N;
  let i = 0;
  let bias = INITIAL_BIAS;
  const delim = input.lastIndexOf("-");
  const basic = delim < 0 ? 0 : delim;
  for (let j = 0; j < basic; j++) {
    const c = input.charCodeAt(j);
    if (c >= 0x80) return null;
    output.push(c);
  }
  let idx = basic > 0 ? basic + 1 : 0;
  while (idx < input.length) {
    const oldi = i;
    let w = 1;
    for (let k = BASE; ; k += BASE) {
      if (idx >= input.length) return null;
      const digit = basicToDigit(input.charCodeAt(idx++));
      if (digit >= BASE) return null;
      if (digit > Math.floor((MAX_INT - i) / w)) return null;
      i += digit * w;
      const t = k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias;
      if (digit < t) break;
      if (w > Math.floor(MAX_INT / (BASE - t))) return null;
      w *= BASE - t;
    }
    const out = output.length + 1;
    bias = adapt(i - oldi, out, oldi === 0);
    n += Math.floor(i / out);
    i %= out;
    if (n > 0x10ffff) return null;
    output.splice(i++, 0, n);
  }
  try {
    return String.fromCodePoint(...output);
  } catch {
    return null;
  }
}

/**
 * Decode one punycode label. The `xn--` prefix is optional
 * (`"xn--mnchen-3ya"` and `"mnchen-3ya"` both give `"münchen"`).
 * Invalid input is returned unchanged; this never throws.
 */
export function decodePunycode(label: string): string {
  if (typeof label !== "string" || !label) return "";
  const raw = /^xn--/i.test(label) ? label.slice(4) : label;
  const out = decodeRaw(raw.toLowerCase());
  return out === null || out === "" ? label : out;
}

/** Lower-case a host, strip a trailing dot and decode every `xn--` label to Unicode. */
export function toUnicodeDomain(host: string): string {
  const h = cleanHost(host);
  if (!h) return "";
  return h
    .split(".")
    .map((l) => (/^xn--/i.test(l) ? decodePunycode(l) : l))
    .join(".");
}

function cleanHost(host: string): string {
  if (typeof host !== "string") return "";
  let h = host.trim().toLowerCase();
  const at = h.lastIndexOf("@");
  if (at >= 0) h = h.slice(at + 1);
  h = h.replace(/^[<\[]+|[>\]]+$/g, "").replace(/\.+$/, "");
  return h;
}

// ---------------------------------------------------------------------------
// Registrable domain
// ---------------------------------------------------------------------------

/** Second-level public suffixes where the registrable domain has three labels. */
const SECOND_LEVEL = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk", "sch.uk",
  "com.np", "org.np", "edu.np", "gov.np", "net.np", "mil.np", "info.np", "name.np", "coop.np",
  "com.au", "net.au", "org.au", "edu.au", "gov.au", "asn.au", "id.au",
  "co.in", "net.in", "org.in", "gen.in", "firm.in", "ind.in", "ac.in", "edu.in", "gov.in", "res.in",
  "co.nz", "org.nz", "net.nz", "ac.nz", "govt.nz",
  "co.jp", "ne.jp", "or.jp", "ac.jp", "go.jp",
  "co.za", "org.za", "gov.za", "ac.za",
  "co.kr", "or.kr", "ac.kr",
  "com.br", "net.br", "org.br", "gov.br",
  "com.cn", "net.cn", "org.cn", "gov.cn", "edu.cn",
  "com.hk", "org.hk", "edu.hk", "gov.hk",
  "com.tw", "org.tw", "edu.tw",
  "com.sg", "org.sg", "edu.sg", "gov.sg",
  "com.my", "org.my", "edu.my", "gov.my",
  "com.pk", "org.pk", "edu.pk", "gov.pk",
  "com.bd", "org.bd", "edu.bd", "gov.bd", "net.bd",
  "com.lk", "org.lk", "edu.lk", "gov.lk",
  "com.mx", "org.mx", "gob.mx",
  "com.ar", "org.ar", "gob.ar",
  "com.tr", "org.tr", "gov.tr",
  "com.sa", "org.sa", "gov.sa",
  "com.eg", "org.eg", "gov.eg",
  "com.ng", "org.ng", "gov.ng",
  "co.ke", "or.ke", "go.ke",
  "co.id", "or.id", "ac.id", "go.id",
  "co.th", "or.th", "ac.th", "go.th",
  "com.ph", "org.ph", "gov.ph",
  "com.vn", "org.vn", "gov.vn",
  "co.il", "org.il", "ac.il", "gov.il",
  "com.qa", "com.kw", "com.om", "com.bh",
]);

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/**
 * Heuristic registrable ("organisational") domain: the last two labels, or the
 * last three under a known second-level suffix such as `co.uk` or `com.np`.
 * IP addresses are returned as-is. Not a full Public Suffix List.
 */
export function registrableDomain(host: string): string {
  const h = cleanHost(host);
  if (!h || IPV4.test(h) || h.includes(":")) return h;
  const labels = h.split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  return SECOND_LEVEL.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
}

/** The distinctive label of a registrable domain: `lacspace` for `mail.lacspace.com.np`. */
function mainLabel(host: string): string {
  const reg = registrableDomain(host);
  return reg.split(".")[0] ?? "";
}

// ---------------------------------------------------------------------------
// Free mail
// ---------------------------------------------------------------------------

/** Consumer mailbox providers anyone can sign up to for free. */
export const FREE_MAIL_DOMAINS: readonly string[] = Object.freeze([
  "gmail.com", "googlemail.com",
  "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "msn.com",
  "yahoo.com", "yahoo.co.uk", "yahoo.co.in", "ymail.com", "rocketmail.com",
  "icloud.com", "me.com", "mac.com",
  "proton.me", "protonmail.com", "pm.me",
  "aol.com",
  "gmx.com", "gmx.net", "gmx.de", "web.de", "mail.com",
  "mail.ru", "inbox.ru", "list.ru", "bk.ru",
  "yandex.com", "yandex.ru", "ya.ru",
  "qq.com", "163.com", "126.com", "sina.com", "yeah.net",
  "zoho.com", "zohomail.com", "tutanota.com", "tuta.io", "fastmail.com", "rediffmail.com",
]);

const FREE_SET = new Set(FREE_MAIL_DOMAINS);

/** True if the domain (or its registrable domain) is a free consumer mailbox provider. */
export function isFreeMail(domain: string, extra: readonly string[] = []): boolean {
  const h = cleanHost(domain);
  if (!h) return false;
  const reg = registrableDomain(h);
  const extraSet = extra.map((d) => cleanHost(d));
  return FREE_SET.has(h) || FREE_SET.has(reg) || extraSet.includes(h) || extraSet.includes(reg);
}

// ---------------------------------------------------------------------------
// Homoglyph skeleton
// ---------------------------------------------------------------------------

/** Single characters that look like an ASCII letter. */
const CONFUSABLES: Record<string, string> = {
  // digits and symbols
  "0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "|": "l", "!": "l", "$": "s",
  i: "l",
  // Cyrillic
  "а": "a", "в": "b", "е": "e", "ё": "e", "к": "k", "м": "m", "н": "h", "о": "o", "р": "p", "с": "c",
  "т": "t", "у": "y", "х": "x", "і": "l", "ї": "l", "ј": "j", "ѕ": "s", "ԁ": "d", "һ": "h", "ӏ": "l",
  "ԛ": "q", "ԝ": "w", "ь": "b", "ɡ": "g", "ɑ": "a", "ɩ": "l", "ʟ": "l", "ո": "n", "ս": "u", "օ": "o",
  // Greek
  "α": "a", "β": "b", "ε": "e", "η": "n", "ι": "l", "κ": "k", "ν": "v", "ο": "o", "ρ": "p", "τ": "t",
  "υ": "u", "χ": "x", "ω": "w", "ϲ": "c", "ϳ": "j",
  // Latin extras
  "ı": "l", "ł": "l", "ĸ": "k", "ß": "b", "ð": "d", "þ": "p", "ø": "o",
};

/** Multi-character sequences that read like one letter. Applied after single-char mapping. */
const SEQUENCES: [RegExp, string][] = [
  [/rn/g, "m"],
  [/vv/g, "w"],
  [/cl/g, "d"],
];

/**
 * Reduce a string to a "skeleton" in which visually confusable characters
 * collapse to one form: `"rnicrosoft"`, `"rn1crosoft"` and `"microsoft"` share a
 * skeleton, as do Latin `lacspace` and `lacspаce` with a Cyrillic `а`.
 * Only for comparison — the output is not meant to be displayed.
 */
export function skeleton(s: string): string {
  if (typeof s !== "string") return "";
  let t = s.normalize("NFKC").toLowerCase();
  // strip combining marks (accents) so é -> e
  t = t.normalize("NFD").replace(/[̀-ͯ]/g, "");
  let out = "";
  for (const ch of t) out += CONFUSABLES[ch] ?? ch;
  for (const [re, rep] of SEQUENCES) out = out.replace(re, rep);
  return out;
}

// ---------------------------------------------------------------------------
// Lookalike detection
// ---------------------------------------------------------------------------

/** Optimal-string-alignment distance (Levenshtein plus adjacent transposition). */
export function editDistance(a: string, b: string): number {
  const A = Array.from(a);
  const B = Array.from(b);
  const m = A.length;
  const n = B.length;
  if (!m) return n;
  if (!n) return m;
  const d: number[][] = [];
  for (let i = 0; i <= m; i++) {
    const row: number[] = new Array(n + 1).fill(0);
    row[0] = i;
    d.push(row);
  }
  for (let j = 0; j <= n; j++) d[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = A[i - 1] === B[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && A[i - 1] === B[j - 2] && A[i - 2] === B[j - 1]) {
        v = Math.min(v, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = v;
    }
  }
  return d[m]![n]!;
}

function allowedDistance(len: number): number {
  if (len >= 9) return 2;
  if (len >= 4) return 1;
  return 0;
}

/**
 * If `domain` imitates one of `candidates`, return the candidate it imitates;
 * otherwise `null`. A domain that *is* one of the candidates (same registrable
 * domain) never matches. Checks, on the registrable label:
 * - homoglyph skeleton match (`lacspаce.com` with Cyrillic а, `rnicrosoft.com`);
 * - punycode `xn--` labels, decoded first;
 * - edit distance ≤ 2 for names of 9+ letters, ≤ 1 for 4–8 letters, e.g. `lacsp4ce.com`;
 * - TLD swap (`lacspace.co` for `lacspace.com`);
 * - the real name hidden in a subdomain (`lacspace.com.evil.io`) or with a
 *   hyphen/prefix/suffix (`lacspace-support.com`, `securelacspace.com`).
 */
export function lookalikeOf(domain: string, candidates: string[]): string | null {
  try {
    const host = toUnicodeDomain(domain);
    if (!host || !Array.isArray(candidates)) return null;
    const reg = registrableDomain(host);
    const cands = candidates
      .filter((c) => typeof c === "string" && c.trim())
      .map((c) => ({ original: c.trim().replace(/^.*@/, ""), reg: registrableDomain(toUnicodeDomain(c)) }))
      .filter((c) => c.reg);
    // The domain is one of the trusted ones: nothing is being imitated.
    if (cands.some((c) => c.reg === reg)) return null;
    if (IPV4.test(host)) return null;

    const label = mainLabel(host);
    const labelSk = skeleton(label);
    const hostLabels = host.split(".");
    const subLabels = hostLabels.slice(0, Math.max(0, hostLabels.length - reg.split(".").length));

    for (const c of cands) {
      const cLabel = mainLabel(c.reg);
      if (!cLabel) continue;
      const cSk = skeleton(cLabel);
      // 1. homoglyph / punycode / TLD swap: same skeleton, different domain
      if (labelSk === cSk) return c.original;
      // 2. small edit distance
      const tol = allowedDistance(Math.min(Array.from(cLabel).length, Array.from(label).length));
      if (tol > 0 && Math.min(editDistance(label, cLabel), editDistance(labelSk, cSk)) <= tol) {
        return c.original;
      }
      if (Array.from(cLabel).length < 4) continue;
      // 3. the real name sits in a subdomain: lacspace.com.evil.io, lacspace.evil.io
      if (subLabels.some((l) => skeleton(l) === cSk)) return c.original;
      // 4. hyphen / affix tricks: lacspace-support.com, secure-lacspace.com, lacspacesupport.com
      const tokens = label.split("-").filter(Boolean);
      if (tokens.length > 1 && tokens.some((t) => skeleton(t) === cSk)) return c.original;
      if (Array.from(cLabel).length >= 5 && labelSk !== cSk && (labelSk.startsWith(cSk) || labelSk.endsWith(cSk))) {
        return c.original;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** True when one DNS label mixes Latin with Cyrillic, Greek or Armenian letters. */
export function hasMixedScript(host: string): boolean {
  const h = toUnicodeDomain(host);
  return h.split(".").some((l) => {
    const latin = /[a-z]/.test(l);
    const other = /[Ͱ-ϿЀ-ӿԀ-ԯ԰-֏]/.test(l);
    return latin && other;
  });
}

/** True when a label is written entirely in a non-Latin script but reads as Latin (e.g. all-Cyrillic `раураl`). */
export function isWholeScriptConfusable(host: string): boolean {
  const h = toUnicodeDomain(host);
  return h.split(".").some((l) => {
    if (!/[^\x00-\x7f]/.test(l)) return false;
    if (/[a-z]/.test(l)) return false;
    return /^[a-z0-9-]+$/.test(skeleton(l));
  });
}
