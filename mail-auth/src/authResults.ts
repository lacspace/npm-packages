/**
 * RFC 8601 Authentication-Results parser (plus Received-SPF and
 * ARC-Authentication-Results). Lenient: malformed input never throws.
 *
 * SECURITY: only the Authentication-Results header added by YOUR OWN receiving
 * server is trustworthy. Anyone can put fake "dkim=pass; dmarc=pass" headers in
 * a message before sending it; those end up BELOW your server's header. Pass
 * `trustedAuthservIds` (your server's authserv-id, e.g. "mx1.example.com") so
 * the parser reads only that header.
 */

export type Verdict =
  | "pass"
  | "fail"
  | "softfail"
  | "neutral"
  | "none"
  | "temperror"
  | "permerror"
  | "policy"
  | null;

export interface AuthResults {
  spf: Verdict;
  dkim: Verdict;
  dmarc: Verdict;
  /** ARC chain verdict, present only when the message carries ARC information. */
  arc?: Verdict;
  /** Every DKIM signature result, with the signing domain (header.d, else header.i). */
  dkimDomains: { domain: string; result: Verdict }[];
  /** SPF-checked domain: smtp.mailfrom (domain part), else smtp.helo, else Received-SPF envelope-from. */
  spfDomain?: string;
  /** Published DMARC policy, lower-case ("none" | "quarantine" | "reject"), when the header reports it. */
  dmarcPolicy?: string;
  /** The RFC5322.From domain the DMARC check ran against. */
  headerFrom?: string;
  /** authserv-id of the header the verdicts were read from. */
  authservId?: string;
  /** The header value(s) the verdicts were read from (selected Authentication-Results, then Received-SPF if used). */
  raw: string[];
}

export interface AuthInputObject {
  authenticationResults?: string | string[];
  receivedSpf?: string | string[];
  arcAuthenticationResults?: string | string[];
}

export interface ParseAuthOptions {
  /**
   * authserv-ids of your own receiving servers. The TOPMOST header with one of
   * these ids is used (a subdomain matches: "hostinger.com" trusts
   * "mx1.hostinger.com"). If none matches, SPF/DKIM/DMARC stay null.
   * Without this option the topmost header is used.
   */
  trustedAuthservIds?: string[];
}

interface MethodResult {
  method: string;
  result: string;
  reason?: string;
  props: Record<string, string>;
  comments: string[];
}

interface ParsedHeader {
  authservId?: string;
  instance?: number;
  results: MethodResult[];
  raw: string;
}

const VERDICTS = new Set(["pass", "fail", "softfail", "neutral", "none", "temperror", "permerror", "policy"]);

function normVerdict(s: string | undefined): Verdict {
  if (!s) return null;
  const v = s.toLowerCase().trim();
  if (VERDICTS.has(v)) return v as Verdict;
  if (v === "hardfail") return "fail";
  if (v === "bestguesspass") return "neutral";
  if (v === "error") return "temperror";
  return null;
}

/** Known RFC 8601 / IANA method names (used to detect results missing a ';'). */
const METHODS = new Set([
  "spf", "dkim", "dmarc", "arc", "iprev", "auth", "dkim-adsp", "dkim-atps", "domainkeys",
  "sender-id", "compauth", "bimi", "smime", "vbr", "rrvs", "x-google-dkim",
]);

// ---------------------------------------------------------------------------
// Lexing
// ---------------------------------------------------------------------------

/** Split on `sep` outside quoted strings and (nested) comments. */
function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "\\" && (quoted || depth > 0)) {
      cur += c + (s[i + 1] ?? "");
      i++;
      continue;
    }
    if (!quoted && c === "(") depth++;
    else if (!quoted && c === ")" && depth > 0) depth--;
    else if (depth === 0 && c === '"') quoted = !quoted;
    if (c === sep && depth === 0 && !quoted) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

interface Tok {
  kind: "word" | "comment";
  text: string;
}

function tokenize(s: string): Tok[] {
  const raw: Tok[] = [];
  let cur = "";
  const flush = () => {
    if (cur) raw.push({ kind: "word", text: cur });
    cur = "";
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === "(") {
      flush();
      let depth = 1;
      let j = i + 1;
      let buf = "";
      while (j < s.length) {
        const d = s[j]!;
        if (d === "\\") {
          buf += s[j + 1] ?? "";
          j += 2;
          continue;
        }
        if (d === "(") depth++;
        else if (d === ")") {
          depth--;
          if (depth === 0) break;
        }
        buf += d;
        j++;
      }
      raw.push({ kind: "comment", text: buf.trim() });
      i = j + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let buf = "";
      while (j < s.length && s[j] !== '"') {
        if (s[j] === "\\") {
          buf += s[j + 1] ?? "";
          j += 2;
          continue;
        }
        buf += s[j];
        j++;
      }
      cur += buf;
      i = j + 1;
      continue;
    }
    if (/\s/.test(c)) {
      flush();
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  flush();
  // Join "key = value" written with spaces around '='.
  const out: Tok[] = [];
  for (let k = 0; k < raw.length; k++) {
    const t = raw[k]!;
    if (t.kind !== "word") {
      out.push(t);
      continue;
    }
    let text = t.text;
    while (k + 1 < raw.length && raw[k + 1]!.kind === "word") {
      const next = raw[k + 1]!.text;
      if (text.endsWith("=") || next.startsWith("=")) {
        text += next;
        k++;
      } else break;
    }
    out.push({ kind: "word", text });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function parseResinfo(tokens: Tok[], into: MethodResult[]): void {
  let current: MethodResult | null = null;
  for (const t of tokens) {
    if (t.kind === "comment") {
      if (current) current.comments.push(t.text);
      continue;
    }
    const eq = t.text.indexOf("=");
    if (eq <= 0) continue; // bare words ("none", version numbers) carry no result
    const key = t.text.slice(0, eq).toLowerCase();
    const value = t.text.slice(eq + 1);
    const method = key.split("/")[0]!;
    if (key.includes(".")) {
      if (current) current.props[key] = value;
    } else if (key === "reason") {
      if (current) current.reason = value;
    } else if (!current || METHODS.has(method) || method.startsWith("x-")) {
      current = { method, result: value.toLowerCase(), props: {}, comments: [] };
      into.push(current);
    } else {
      current.props[key] = value; // action=, p=, policy=, etc.
    }
  }
}

function parseHeaderValue(value: string, arc = false): ParsedHeader {
  const v = value.trim();
  const segs = splitTopLevel(v, ";");
  const header: ParsedHeader = { results: [], raw: v };
  if (arc && segs.length) {
    const m = /^i\s*=\s*(\d+)$/i.exec(segs[0]!);
    if (m) {
      header.instance = Number(m[1]);
      segs.shift();
    }
  }
  segs.forEach((seg, idx) => {
    const tokens = tokenize(seg);
    if (idx === 0) {
      const first = tokens.find((t) => t.kind === "word");
      if (first && !first.text.includes("=")) {
        header.authservId = first.text.toLowerCase();
        const rest = tokens.slice(tokens.indexOf(first) + 1);
        parseResinfo(rest, header.results);
        return;
      }
    }
    parseResinfo(tokens, header.results);
  });
  return header;
}

// ---------------------------------------------------------------------------
// Header extraction
// ---------------------------------------------------------------------------

type Bucket = "ar" | "spf" | "arc";

const NAME_TO_BUCKET: Record<string, Bucket> = {
  "authentication-results": "ar",
  "received-spf": "spf",
  "arc-authentication-results": "arc",
};

interface Buckets {
  ar: string[];
  spf: string[];
  arc: string[];
}

function extractInto(s: string, fallback: Bucket, b: Buckets): void {
  if (typeof s !== "string" || !s.trim()) return;
  const unfolded = s.replace(/\r?\n[ \t]+/g, " ");
  const lines = unfolded.split(/\r?\n/).filter((l) => l.trim());
  const headerRe = /^([A-Za-z][A-Za-z0-9-]*)[ \t]*:[ \t]*(.*)$/;
  const anyPrefixed = lines.some((l) => headerRe.test(l));
  if (!anyPrefixed) {
    b[fallback].push(lines.join(" ").trim());
    return;
  }
  let last: { bucket: Bucket; idx: number } | null = null;
  for (const line of lines) {
    const m = headerRe.exec(line);
    if (m) {
      const bucket = NAME_TO_BUCKET[m[1]!.toLowerCase()];
      if (bucket) {
        b[bucket].push(m[2]!.trim());
        last = { bucket, idx: b[bucket].length - 1 };
      } else last = null; // some other header (Received:, From:, ...)
    } else if (last) {
      b[last.bucket][last.idx] += " " + line.trim();
    } else {
      b[fallback].push(line.trim());
    }
  }
}

function collect(input: unknown): Buckets {
  const b: Buckets = { ar: [], spf: [], arc: [] };
  const each = (v: unknown, bucket: Bucket) => {
    if (typeof v === "string") extractInto(v, bucket, b);
    else if (Array.isArray(v)) for (const x of v) if (typeof x === "string") extractInto(x, bucket, b);
  };
  if (typeof input === "string" || Array.isArray(input)) each(input, "ar");
  else if (input && typeof input === "object") {
    const o = input as AuthInputObject;
    each(o.authenticationResults, "ar");
    each(o.receivedSpf, "spf");
    each(o.arcAuthenticationResults, "arc");
  }
  return b;
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

/** Failure strength, strongest first; used when no DKIM signature passed. */
const FAILURE_RANK: Exclude<Verdict, null>[] = ["fail", "policy", "permerror", "softfail", "temperror", "neutral", "none"];

function best(verdicts: Verdict[]): Verdict {
  const vs = verdicts.filter((v): v is Exclude<Verdict, null> => v !== null);
  if (!vs.length) return null;
  if (vs.includes("pass")) return "pass";
  for (const f of FAILURE_RANK) if (vs.includes(f)) return f;
  return vs[0] ?? null;
}

function first(verdicts: Verdict[]): Verdict {
  return verdicts.find((v) => v !== null) ?? null;
}

function domainPart(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const d = s.slice(s.lastIndexOf("@") + 1).trim().toLowerCase().replace(/[<>]/g, "").replace(/\.$/, "");
  return d || undefined;
}

function policyFrom(r: MethodResult): string | undefined {
  for (const c of r.comments) {
    const m = /(?:^|[\s;,])p\s*=\s*([a-z]+)/i.exec(c);
    if (m) return m[1]!.toLowerCase();
  }
  const direct = r.props["p"] ?? r.props["policy.published-domain-policy"] ?? r.props["policy.dmarc"];
  return direct ? direct.toLowerCase() : undefined;
}

function emptyResult(): AuthResults {
  return { spf: null, dkim: null, dmarc: null, dkimDomains: [], raw: [] };
}

/**
 * Parse Authentication-Results (RFC 8601), with Received-SPF as an SPF fallback
 * and ARC-Authentication-Results for the ARC verdict. Accepts raw header values,
 * full "Name: value" header lines, a whole header block, or an object with each
 * header kind. Order matters: list headers top-down as they appear in the message.
 * Never throws.
 */
export function parseAuthenticationResults(
  input: string | string[] | AuthInputObject,
  opts: ParseAuthOptions = {},
): AuthResults {
  try {
    const b = collect(input);
    const out = emptyResult();
    const parsed = b.ar.map((v) => parseHeaderValue(v));
    const trusted = (opts.trustedAuthservIds ?? [])
      .filter((t) => typeof t === "string" && t.trim())
      .map((t) => t.trim().toLowerCase());
    const isTrusted = (id?: string) => !!id && trusted.some((t) => id === t || id.endsWith("." + t));

    let idx = -1;
    if (trusted.length) idx = parsed.findIndex((p) => isTrusted(p.authservId));
    else if (parsed.length) idx = 0;

    // A receiving server may split results over several consecutive headers
    // with its own id (e.g. one from the DKIM filter, one from the DMARC filter).
    const selected: ParsedHeader[] = [];
    if (idx >= 0) {
      const id = parsed[idx]!.authservId;
      for (let j = idx; j < parsed.length && parsed[j]!.authservId === id; j++) selected.push(parsed[j]!);
    }
    const results = selected.flatMap((h) => h.results);
    if (selected.length) {
      out.authservId = selected[0]!.authservId;
      out.raw.push(...selected.map((h) => h.raw));
    }

    const by = (m: string) => results.filter((r) => r.method === m);
    const spfR = by("spf");
    const dkimR = by("dkim");
    const dmarcR = by("dmarc");
    const arcR = by("arc");

    out.spf = first(spfR.map((r) => normVerdict(r.result)));
    out.dkim = best(dkimR.map((r) => normVerdict(r.result)));
    out.dmarc = first(dmarcR.map((r) => normVerdict(r.result)));

    for (const r of dkimR) {
      const domain = domainPart(r.props["header.d"]) ?? domainPart(r.props["header.i"]);
      if (domain) out.dkimDomains.push({ domain, result: normVerdict(r.result) });
    }

    const spfHit = spfR.find((r) => normVerdict(r.result) !== null) ?? spfR[0];
    if (spfHit) out.spfDomain = domainPart(spfHit.props["smtp.mailfrom"]) ?? domainPart(spfHit.props["smtp.helo"]);

    const dmarcHit = dmarcR.find((r) => normVerdict(r.result) !== null) ?? dmarcR[0];
    if (dmarcHit) {
      const p = policyFrom(dmarcHit);
      if (p) out.dmarcPolicy = p;
    }
    const fromHolder = [dmarcHit, ...results].find((r) => r && r.props["header.from"]);
    const hf = domainPart(fromHolder?.props["header.from"]);
    if (hf) out.headerFrom = hf;

    // Received-SPF fallback (topmost header; it is added by the receiving server).
    if (!spfR.length && b.spf.length) {
      const v = b.spf[0]!;
      const word = /^\s*([A-Za-z]+)/.exec(v)?.[1];
      out.spf = normVerdict(word);
      if (out.spf !== null) {
        out.raw.push(v);
        const env = /envelope-from\s*=\s*"?<?([^\s;">]+)/i.exec(v)?.[1];
        const mf = /smtp\.mailfrom\s*=\s*"?<?([^\s;">]+)/i.exec(v)?.[1];
        const of = /domain of\s+(?:transitioning\s+)?(?:[^\s@]+@)?([^\s;)]+)/i.exec(v)?.[1];
        const helo = /helo\s*=\s*"?([^\s;"]+)/i.exec(v)?.[1];
        const d = domainPart(env) ?? domainPart(mf) ?? domainPart(of) ?? domainPart(helo);
        if (d && !out.spfDomain) out.spfDomain = d;
      }
    }

    // ARC: the arc= result of the selected header, else the newest ARC-Authentication-Results.
    const arcVerdict = first(arcR.map((r) => normVerdict(r.result)));
    if (arcR.length) out.arc = arcVerdict;
    else if (b.arc.length) {
      const arcs = b.arc.map((v) => parseHeaderValue(v, true));
      const newest = arcs.reduce((a, c) => ((c.instance ?? 0) > (a.instance ?? 0) ? c : a), arcs[0]!);
      const own = first(newest.results.filter((r) => r.method === "arc").map((r) => normVerdict(r.result)));
      const dm = first(newest.results.filter((r) => r.method === "dmarc").map((r) => normVerdict(r.result)));
      out.arc = own ?? dm ?? best(newest.results.filter((r) => r.method === "dkim").map((r) => normVerdict(r.result)));
    }
    return out;
  } catch {
    return emptyResult();
  }
}
