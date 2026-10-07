/** Tag-list parsing for DKIM-Signature headers and DKIM key records (RFC 6376 §3.2). */

import type { Canon } from "./canon";

export class DkimError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DkimError";
  }
}

const FWS = /[ \t\r\n]+/g;

/** Parse `tag=value; tag=value` into a map. Duplicate tags are an error. */
export function parseTagList(input: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const seg of input.split(";")) {
    if (!seg.replace(FWS, "")) continue; // empty (trailing ';')
    const eq = seg.indexOf("=");
    if (eq < 0) throw new DkimError(`malformed tag "${seg.trim()}"`);
    const name = seg.slice(0, eq).replace(FWS, "");
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) throw new DkimError(`invalid tag name "${name}"`);
    if (Object.prototype.hasOwnProperty.call(out, name)) throw new DkimError(`duplicate tag "${name}"`);
    out[name] = seg
      .slice(eq + 1)
      .replace(/^[ \t\r\n]+/, "")
      .replace(/[ \t\r\n]+$/, "");
  }
  return out;
}

/** Decode dkim-quoted-printable (used by i= and z=). */
function decodeQp(s: string): string {
  return s.replace(FWS, "").replace(/=([0-9A-Fa-f]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

export interface DkimSignature {
  /** v= (must be "1"). */
  version: string;
  /** a=, lower-cased, e.g. "rsa-sha256". */
  algorithm: string;
  /** b=, base64 with whitespace removed. */
  signature: string;
  /** bh=, base64 with whitespace removed. */
  bodyHash: string;
  canonicalization: { header: Canon; body: Canon };
  /** d= signing domain (lower-cased). */
  domain: string;
  /** s= selector. */
  selector: string;
  /** h= signed header names, lower-cased, in order (repeats kept). */
  headers: string[];
  /** i= agent/user identifier (defaults to "@" + d=). */
  identity: string;
  /** l= body length, if present. */
  bodyLength?: number;
  /** q= query methods (default "dns/txt"). */
  query: string;
  /** t= signature timestamp (Unix seconds). */
  timestamp?: number;
  /** x= expiration (Unix seconds). */
  expires?: number;
  /** All raw tags. */
  tags: Record<string, string>;
}

function parseCanon(c: string | undefined): { header: Canon; body: Canon } {
  if (c === undefined) return { header: "simple", body: "simple" };
  const [h, b] = c.toLowerCase().split("/");
  const ok = (x: string | undefined): x is Canon => x === "simple" || x === "relaxed";
  if (!ok(h) || (b !== undefined && !ok(b))) throw new DkimError(`unknown canonicalization "${c}"`);
  return { header: h, body: b ?? "simple" };
}

function parseNum(v: string | undefined, tag: string): number | undefined {
  if (v === undefined) return undefined;
  if (!/^\d{1,76}$/.test(v)) throw new DkimError(`invalid ${tag}= value`);
  return Number(v);
}

/**
 * Parse the value of a DKIM-Signature header (everything after the colon).
 * Throws {@link DkimError} on syntax errors or missing required tags.
 */
export function parseDkimSignature(headerValue: string): DkimSignature {
  const tags = parseTagList(headerValue);
  for (const t of ["v", "a", "b", "bh", "d", "h", "s"]) {
    if (tags[t] === undefined) throw new DkimError(`missing required tag ${t}=`);
  }
  const domain = tags.d!.toLowerCase().replace(/\.$/, "");
  const headers = tags
    .h!.split(":")
    .map((h) => h.replace(FWS, "").toLowerCase())
    .filter(Boolean);
  return {
    version: tags.v!,
    algorithm: tags.a!.toLowerCase(),
    signature: tags.b!.replace(FWS, ""),
    bodyHash: tags.bh!.replace(FWS, ""),
    canonicalization: parseCanon(tags.c),
    domain,
    selector: tags.s!.replace(FWS, ""),
    headers,
    identity: tags.i !== undefined ? decodeQp(tags.i) : "@" + domain,
    bodyLength: parseNum(tags.l, "l"),
    query: tags.q ?? "dns/txt",
    timestamp: parseNum(tags.t, "t"),
    expires: parseNum(tags.x, "x"),
    tags,
  };
}

export interface DkimKey {
  /** v= (DKIM1 when present). */
  version?: string;
  /** k= key type, default "rsa". */
  keyType: string;
  /** h= acceptable hash algorithms (empty = all). */
  hashAlgorithms: string[];
  /** p= base64 public key, whitespace removed. Empty string = revoked. */
  publicKey: string;
  /** p= present but empty. */
  revoked: boolean;
  /** t=y: domain is testing DKIM. */
  testing: boolean;
  /** t=s: i= domain must equal d= exactly. */
  strict: boolean;
  /** s= service types (default ["*"]). */
  services: string[];
  /** n= notes. */
  notes?: string;
  tags: Record<string, string>;
}

/**
 * Parse a DKIM key TXT record. Accepts the record as one string or as the
 * array of character-strings DNS returns (they are joined with no separator).
 */
export function parseDkimKey(txt: string | string[]): DkimKey {
  const s = Array.isArray(txt) ? txt.join("") : txt;
  const tags = parseTagList(s);
  if (tags.v !== undefined && tags.v !== "DKIM1") throw new DkimError(`unsupported key version v=${tags.v}`);
  if (tags.p === undefined) throw new DkimError("key record has no p= tag");
  const p = tags.p.replace(FWS, "");
  const list = (v: string | undefined) =>
    v === undefined
      ? []
      : v
          .split(":")
          .map((x) => x.replace(FWS, "").toLowerCase())
          .filter(Boolean);
  const flags = list(tags.t);
  const services = list(tags.s);
  return {
    version: tags.v,
    keyType: (tags.k ?? "rsa").replace(FWS, "").toLowerCase(),
    hashAlgorithms: list(tags.h),
    publicKey: p,
    revoked: p === "",
    testing: flags.includes("y"),
    strict: flags.includes("s"),
    services: services.length ? services : ["*"],
    notes: tags.n,
    tags,
  };
}

/**
 * Remove the b= tag's value from a raw DKIM-Signature header value, keeping
 * the "b=" itself (RFC 6376 §3.5 / §3.7). Everything between "b=" and the next
 * ";" (or the end) is deleted, including folding whitespace.
 */
export function stripSignatureValue(headerValue: string): string {
  return headerValue
    .split(";")
    .map((seg) => {
      const m = /^([ \t\r\n]*b[ \t\r\n]*=)/.exec(seg);
      return m ? m[1]! : seg;
    })
    .join(";");
}
