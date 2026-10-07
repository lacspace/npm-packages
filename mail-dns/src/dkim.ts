/** DKIM (RFC 6376) public-key records: parse, size the key, check selectors. */
import type { Dns } from "./resolver.js";
import type { Check, MailDomainConfig, Problem } from "./types.js";
import { parseTags, prob as p, statusFrom } from "./util.js";

/** Selectors tried on every check (the provider presets add their own). */
export const COMMON_DKIM_SELECTORS = [
  "default", "google", "selector1", "selector2", "k1", "k2", "s1", "s2", "mail", "dkim", "hostinger",
  "hostingermail-a", "hostingermail-b", "hostingermail-c", "zoho", "zmail", "mx", "smtp", "brevo1", "brevo2", "mail1",
  "20230601", "20221208", "20210112", "20161025",
];

export interface ParsedDkimKey {
  record: string;
  valid: boolean;
  tags: Record<string, string>;
  keyType: string;
  /** Base64 public key with whitespace removed ("" when revoked). */
  publicKey: string;
  revoked: boolean;
  /** `t=y`: the domain is testing DKIM; receivers may ignore failures. */
  testing: boolean;
  /** `t=s`: the signing domain must exactly match (no subdomains). */
  strict: boolean;
  hashAlgorithms?: string[];
  /** RSA modulus size in bits (exact from DER when parseable, else estimated); 256 for ed25519. */
  keyBits?: number;
  /** True when keyBits was estimated from the base64 length rather than read from the key. */
  keyBitsEstimated?: boolean;
  problems: Problem[];
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Decode standard base64 to bytes; `undefined` if invalid. Isomorphic. */
export function base64ToBytes(s: string): Uint8Array | undefined {
  const clean = s.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 === 1) return undefined;
  const body = clean.replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((body.length * 3) / 4));
  let buf = 0, bits = 0, j = 0;
  for (const ch of body) {
    buf = (buf << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) { bits -= 8; out[j++] = (buf >> bits) & 0xff; }
  }
  return out.subarray(0, j);
}

function tlv(b: Uint8Array, off: number): { tag: number; start: number; end: number } | undefined {
  if (off + 2 > b.length) return undefined;
  const tag = b[off]!;
  let len = b[off + 1]!;
  let start = off + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n < 1 || n > 4 || start + n > b.length) return undefined;
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + b[start + i]!;
    start += n;
  }
  if (start + len > b.length) return undefined;
  return { tag, start, end: start + len };
}

/** Exact RSA modulus bit length from a SubjectPublicKeyInfo or PKCS#1 DER key. */
export function rsaModulusBits(der: Uint8Array): number | undefined {
  const top = tlv(der, 0);
  if (!top || top.tag !== 0x30) return undefined;
  let first = tlv(der, top.start);
  if (!first) return undefined;
  let seq = top;
  if (first.tag === 0x30) {
    // SPKI: SEQ { SEQ alg, BIT STRING { SEQ { INTEGER n, INTEGER e } } }
    const bit = tlv(der, first.end);
    if (!bit || bit.tag !== 0x03) return undefined;
    const inner = tlv(der, bit.start + 1);
    if (!inner || inner.tag !== 0x30) return undefined;
    seq = inner;
    first = tlv(der, seq.start);
    if (!first) return undefined;
  }
  if (first.tag !== 0x02) return undefined;
  let i = first.start;
  while (i < first.end && der[i] === 0) i++;
  if (i >= first.end) return undefined;
  const lead = der[i]!;
  return (first.end - i - 1) * 8 + (32 - Math.clz32(lead));
}

const SIZES = [512, 768, 1024, 1536, 2048, 3072, 4096, 8192];

/** Parse a DKIM key record (`v=DKIM1; k=rsa; p=...`). Pure; never throws. */
export function parseDkimKey(record: string): ParsedDkimKey {
  const rec = record.trim();
  const { tags, order } = parseTags(rec);
  const out: ParsedDkimKey = {
    record: rec, valid: true, tags, keyType: (tags.k ?? "rsa").toLowerCase(), publicKey: (tags.p ?? "").replace(/\s+/g, ""),
    revoked: false, testing: false, strict: false, problems: [],
  };
  const bad = (code: string, msg: string) => { out.valid = false; out.problems.push(p(code, "error", msg)); };
  if (tags.v !== undefined && (order[0] !== "v" || tags.v !== "DKIM1")) bad("dkim-version", 'A DKIM record must start with "v=DKIM1;" (or leave v= out entirely).');
  const flags = (tags.t ?? "").split(":").map((s) => s.trim().toLowerCase());
  out.testing = flags.includes("y");
  out.strict = flags.includes("s");
  if (tags.h) out.hashAlgorithms = tags.h.split(":").map((s) => s.trim().toLowerCase());
  if (!("p" in tags)) { bad("dkim-no-key", 'This DKIM record has no "p=" public key. Copy the full value your mail provider gave you.'); return out; }
  if (!out.publicKey) {
    out.revoked = true;
    out.problems.push(p("dkim-revoked", "warning", "This DKIM key has been revoked (the p= value is empty), so mail signed with it fails DKIM."));
    return out;
  }
  if (out.keyType !== "rsa" && out.keyType !== "ed25519") bad("dkim-key-type", `"k=${tags.k}" is not a key type receivers understand. Use rsa (or ed25519).`);
  const bytes = base64ToBytes(out.publicKey);
  if (!bytes || bytes.length < 16) {
    bad("dkim-bad-key", "The DKIM public key (p=) is damaged — often a missing or extra character from copy-pasting, or quotes inside the value. Copy it again exactly as your provider shows it.");
    return out;
  }
  if (out.keyType === "ed25519") out.keyBits = 256;
  else {
    const exact = rsaModulusBits(bytes);
    if (exact) out.keyBits = exact;
    else {
      const est = Math.max(0, bytes.length - 38) * 8;
      out.keyBits = SIZES.reduce((a, b) => (Math.abs(b - est) < Math.abs(a - est) ? b : a));
      out.keyBitsEstimated = true;
    }
    if (out.keyBits < 1024) bad("dkim-weak-key", `This DKIM key is only ${out.keyBits} bits, which receivers like Gmail reject as too weak. Generate a new 2048-bit key.`);
    else if (out.keyBits < 2048) out.problems.push(p("dkim-1024", "info", `This DKIM key is ${out.keyBits} bits. It works, but 2048 bits is the current recommendation; upgrade at your next key rotation.`));
  }
  if (out.testing) out.problems.push(p("dkim-testing", "warning", 'This DKIM key is marked as "testing" (t=y), so receivers may ignore DKIM failures. Remove "t=y" once mail is signing correctly.'));
  if (out.hashAlgorithms && out.hashAlgorithms.every((h) => h === "sha1")) {
    out.problems.push(p("dkim-sha1", "warning", 'This DKIM key only allows SHA-1 signatures ("h=sha1"), which receivers no longer trust. Remove the h= tag or set h=sha256.'));
  }
  return out;
}

/**
 * Normalise a DKIM public key you were given: accepts a bare base64 key, a
 * PEM block, or a full `v=DKIM1; ...; p=...` value. Returns the bare base64. Pure.
 */
export function normalizeDkimPublicKey(input: string): string {
  const s = input.trim().replace(/^"|"$/g, "");
  if (/-----BEGIN/.test(s)) return s.replace(/-----(BEGIN|END)[^-]+-----/g, "").replace(/\s+/g, "");
  if (/(^|;)\s*p\s*=/i.test(s)) return (parseTags(s.replace(/"\s*"/g, "")).tags.p ?? "").replace(/\s+/g, "");
  return s.replace(/\s+/g, "");
}

/** Build the TXT value for a DKIM key. Pure. */
export function buildDkim(publicKey: string): string {
  const s = publicKey.trim();
  if (/^v=DKIM1/i.test(s)) return s.replace(/"\s*"/g, "").replace(/\s*;\s*/g, "; ").replace(/;\s*$/, "");
  const key = normalizeDkimPublicKey(s);
  const k = /(^|;)\s*k\s*=\s*ed25519/i.test(s) ? "ed25519" : "rsa";
  return `v=DKIM1; k=${k}; p=${key}`;
}

const looksDkim = (t: string) => /(^|;)\s*(v\s*=\s*DKIM1|p\s*=)/i.test(t);

/** @internal */
export async function checkDkim(dns: Dns, domain: string, expect: Partial<MailDomainConfig> | undefined, selectors: string[]): Promise<Check[]> {
  const want = expect?.dkim;
  const wantSel = want?.selector?.toLowerCase();
  const all = [...new Set([...(wantSel ? [wantSel] : []), ...selectors.map((s) => s.toLowerCase())])];
  const results = await Promise.all(all.map(async (sel) => ({ sel, r: await dns.txt(`${sel}._domainkey.${domain}`) })));
  const checks: Check[] = [];
  for (const { sel, r } of results) {
    const isWanted = sel === wantSel;
    const expected = isWanted && want ? buildDkim(want.publicKey) : undefined;
    const base: Check = { kind: "dkim", selector: sel, status: "missing", problems: [], ...(expected ? { expected } : {}) };
    if (r.kind === "error" || r.kind === "unsupported") {
      if (isWanted) checks.push({ ...base, status: "error", problems: [p("dns-error", "error", `We couldn't look up ${sel}._domainkey.${domain} (${r.kind === "error" ? r.error : "unsupported"}). Try again shortly.`)] });
      continue;
    }
    const recs = r.kind === "ok" ? r.value.filter(looksDkim) : [];
    if (!recs.length) {
      if (!isWanted) continue;
      const problems = [p("dkim-missing", "error", `Your DKIM key isn't published yet. Add a TXT record with the name ${sel}._domainkey and the value: ${expected}`)];
      const doubled = await dns.txt(`${sel}._domainkey.${domain}.${domain}`);
      if (doubled.kind === "ok" && doubled.value.some(looksDkim)) {
        problems.push(p("dkim-doubled-name", "error", `Your DKIM record ended up at ${sel}._domainkey.${domain}.${domain} — your DNS panel added the domain a second time. Change the name to just "${sel}._domainkey".`));
      }
      checks.push({ ...base, problems });
      continue;
    }
    if (recs.length > 1) {
      checks.push({ ...base, status: "fail", found: recs, problems: [p("dkim-multiple", "error", `There are ${recs.length} DKIM records at ${sel}._domainkey. Keep exactly one.`)] });
      continue;
    }
    const k = parseDkimKey(recs[0]!);
    const problems = [...k.problems];
    if (isWanted && want) {
      const wantKey = normalizeDkimPublicKey(want.publicKey);
      if (k.publicKey && wantKey && k.publicKey !== wantKey) {
        problems.push(p("dkim-key-mismatch", "error", `The DKIM key at ${sel}._domainkey is different from the one we sign with, so your mail will fail DKIM. Replace the record's value with: ${expected}`));
      }
      if (k.revoked) problems.forEach((x) => { if (x.code === "dkim-revoked") x.severity = "error"; });
    } else if (k.revoked) {
      // A revoked spare selector is normal during key rotation (e.g. Hostinger's -b/-c).
      problems.forEach((x) => {
        if (x.code === "dkim-revoked") { x.severity = "info"; x.message = `The key at "${sel}" is revoked (empty p=). That's normal for a spare selector during key rotation.`; }
      });
    }
    checks.push({
      ...base,
      status: k.revoked && !isWanted ? "warn" : statusFrom(problems),
      found: recs[0]!,
      problems,
      details: { keyType: k.keyType, keyBits: k.keyBits, keyBitsEstimated: k.keyBitsEstimated, revoked: k.revoked, testing: k.testing },
    });
  }
  const revoked = checks.filter((c) => c.details?.revoked && c.selector !== wantSel).map((c) => c.selector!);
  if (!wantSel && checks.length === revoked.length && revoked.length) {
    checks.unshift({
      kind: "dkim", status: "missing", problems: [p("dkim-only-revoked", "error", `We only found revoked DKIM keys (${revoked.join(", ")}), so none of your mail is signed with a working key. Turn on DKIM in your mail provider and publish the active key it gives you; if it's already there, tell us its selector.`)],
    });
  } else if (!checks.length) {
    checks.push({
      kind: "dkim", status: "missing", problems: [p("dkim-not-found", "error", `We couldn't find a DKIM key. We tried the usual names (${all.slice(0, 8).join(", ")}, ...). Turn on DKIM in your mail provider and add the TXT record it gives you; if it's already there, tell us its selector (the part before "._domainkey").`)],
    });
  }
  return checks;
}
