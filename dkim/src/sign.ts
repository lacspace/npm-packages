/** DKIM signing (RFC 6376 §5, RFC 8463). */

import {
  type Canon,
  asciiLower,
  binaryToBytes,
  canonicalizeBody,
  canonicalizeHeader,
  parseHeaderFields,
  selectHeaders,
  splitMessage,
  toBinary,
  toCrlf,
} from "./canon";
import { type CryptoLike, type DkimAlgorithm, base64Encode, bs, getSubtle, importPrivateKey, sha256 } from "./crypto";
import { DkimError } from "./tags";

/** Headers signed by default (when present in the message). */
export const DEFAULT_SIGNED_HEADERS: readonly string[] = [
  "from",
  "to",
  "cc",
  "subject",
  "date",
  "message-id",
  "reply-to",
  "in-reply-to",
  "references",
  "mime-version",
  "content-type",
  "content-transfer-encoding",
  "list-unsubscribe",
  "list-unsubscribe-post",
];

export interface SignOptions {
  /** d= signing domain. */
  domain: string;
  /** s= selector. */
  selector: string;
  /** CryptoKey, or a PKCS#8 ("PRIVATE KEY") / PKCS#1 ("RSA PRIVATE KEY") PEM. */
  privateKey: CryptoKey | string;
  /** Default: detected from the key (rsa-sha256 for RSA, ed25519-sha256 for Ed25519). */
  algorithm?: DkimAlgorithm;
  /** Default "relaxed". */
  headerCanon?: Canon;
  /** Default "relaxed". */
  bodyCanon?: Canon;
  /**
   * Header names to sign. Each name is signed once per occurrence in the
   * message; names not present are still listed (which stops them being
   * added later). From is always included and over-signed.
   * Default: {@link DEFAULT_SIGNED_HEADERS}, only those present.
   */
  headers?: string[];
  /** Over-sign From (list it one extra time so another From can't be prepended). Default true. */
  oversignFrom?: boolean;
  /** i= identity, e.g. "@example.com" or "news@mail.example.com". Must be within d=. */
  identity?: string;
  /** Adds x= this many seconds after t=. */
  expiresInSec?: number;
  /** Add t= (signing time). Default true. */
  timestamp?: boolean;
  /** Signing time (Date or ms since epoch). Default: now. */
  time?: Date | number;
  /**
   * l= body length. `true` signs the whole canonical body length; a number
   * signs only that many canonical octets. Discouraged: content appended after
   * the signed length is not protected.
   */
  bodyLength?: number | boolean;
  /** Injected WebCrypto (otherwise globalThis.crypto). */
  crypto?: CryptoLike;
}

const MAX_LINE = 76;

/** Fold tag strings into a header value, starting after "DKIM-Signature:". */
function fold(pieces: { text: string; joinNoSpace?: boolean }[], startCol: number): string {
  let out = "";
  let col = startCol;
  pieces.forEach((p, i) => {
    if (i === 0) {
      out += " " + p.text;
      col += 1 + p.text.length;
      return;
    }
    const sep = p.joinNoSpace ? "" : " ";
    if (col + sep.length + p.text.length > MAX_LINE) {
      out += "\r\n " + p.text;
      col = 1 + p.text.length;
    } else {
      out += sep + p.text;
      col += sep.length + p.text.length;
    }
  });
  return out;
}

function inDomain(identityDomain: string, d: string): boolean {
  const a = identityDomain.toLowerCase();
  const b = d.toLowerCase();
  return a === b || a.endsWith("." + b);
}

interface Prepared {
  header: string; // full "DKIM-Signature: ..." line(s), CRLF folded, no trailing CRLF
}

async function build(raw: string | Uint8Array, o: SignOptions): Promise<Prepared> {
  if (!o.domain || !o.selector) throw new DkimError("domain and selector are required");
  const domain = o.domain.toLowerCase().replace(/\.$/, "");
  const { key, algorithm } = await importPrivateKey(o.privateKey, o.algorithm, o.crypto);
  const hc: Canon = o.headerCanon ?? "relaxed";
  const bc: Canon = o.bodyCanon ?? "relaxed";

  const msg = toCrlf(toBinary(raw));
  const { header, body } = splitMessage(msg);
  const fields = parseHeaderFields(header);
  if (!fields.some((f) => f.key === "from")) throw new DkimError("message has no From header");

  // Header list
  const explicit = o.headers !== undefined;
  const wanted: string[] = [];
  for (const n of ["from", ...(o.headers ?? DEFAULT_SIGNED_HEADERS)].map((h) => asciiLower(h.trim()))) {
    if (n && !wanted.includes(n)) wanted.push(n);
  }
  const hList: string[] = [];
  for (const n of wanted) {
    const count = fields.filter((f) => f.key === n).length;
    if (count === 0 && !explicit) continue;
    for (let i = 0; i < Math.max(count, 1); i++) hList.push(n);
  }
  if (o.oversignFrom !== false) hList.push("from");

  // Body hash
  let canonBody = canonicalizeBody(body, bc);
  let l: number | undefined;
  if (o.bodyLength === true) l = canonBody.length;
  else if (typeof o.bodyLength === "number") {
    if (!Number.isInteger(o.bodyLength) || o.bodyLength < 0) throw new DkimError("bodyLength must be a non-negative integer");
    l = Math.min(o.bodyLength, canonBody.length);
    canonBody = canonBody.slice(0, l);
  }
  const bh = base64Encode(await sha256(binaryToBytes(canonBody), o.crypto));

  // Tags
  const now = Math.floor((o.time === undefined ? Date.now() : +o.time) / 1000);
  const pieces: { text: string; joinNoSpace?: boolean }[] = [
    { text: "v=1;" },
    { text: `a=${algorithm};` },
    { text: `c=${hc}/${bc};` },
    { text: `d=${domain};` },
    { text: `s=${o.selector};` },
  ];
  if (o.identity !== undefined) {
    const at = o.identity.lastIndexOf("@");
    if (at < 0) throw new DkimError('identity must contain "@"');
    if (!inDomain(o.identity.slice(at + 1), domain)) throw new DkimError("identity domain must be d= or a subdomain of it");
    pieces.push({ text: `i=${o.identity.replace(/[^\x21-\x3a\x3c\x3e-\x7e]/g, (c) => "=" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"))};` });
  }
  if (l !== undefined) pieces.push({ text: `l=${l};` });
  if (o.timestamp !== false || o.expiresInSec !== undefined) pieces.push({ text: `t=${now};` });
  if (o.expiresInSec !== undefined) {
    if (!(o.expiresInSec > 0)) throw new DkimError("expiresInSec must be positive");
    pieces.push({ text: `x=${now + Math.floor(o.expiresInSec)};` });
  }
  hList.forEach((h, i) => {
    const last = i === hList.length - 1;
    pieces.push({ text: (i === 0 ? "h=" : "") + h + (last ? ";" : ":"), joinNoSpace: i > 0 });
  });
  pieces.push({ text: `bh=${bh};` });
  pieces.push({ text: "b=" });

  const NAME = "DKIM-Signature";
  const templateValue = fold(pieces, NAME.length + 1);

  // Data to sign: selected headers + the DKIM-Signature with empty b=, no trailing CRLF
  let data = "";
  for (const f of selectHeaders(fields, hList)) {
    if (f) data += canonicalizeHeader(f.name, f.value, hc);
  }
  data += canonicalizeHeader(NAME, templateValue, hc).slice(0, -2);

  const subtle = await getSubtle(o.crypto);
  const bytes = binaryToBytes(data);
  const sig =
    algorithm === "rsa-sha256"
      ? await subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, key, bs(bytes))
      : await subtle.sign({ name: "Ed25519" }, key, bs(await sha256(bytes, o.crypto)));
  const b = base64Encode(new Uint8Array(sig));

  // Append b= value, folded
  const lastLine = templateValue.slice(templateValue.lastIndexOf("\n") + 1);
  let col = (templateValue.includes("\n") ? 0 : NAME.length + 1) + lastLine.length;
  let rest = b;
  let value = templateValue;
  while (rest.length) {
    const room = MAX_LINE - col;
    if (room < 8) {
      value += "\r\n ";
      col = 1;
      continue;
    }
    value += rest.slice(0, room);
    rest = rest.slice(room);
    col += room;
  }
  return { header: `${NAME}:${value}` };
}

/** Sign a message and return just the `DKIM-Signature: …` header (folded with CRLF, no trailing CRLF). */
export async function signHeader(raw: string | Uint8Array, options: SignOptions): Promise<string> {
  return (await build(raw, options)).header;
}

/**
 * Sign a message and return it with the DKIM-Signature header prepended.
 * The header uses the message's own line ending (CRLF, or LF if the input
 * only uses LF). Uint8Array input is decoded as UTF-8 for the returned
 * string; use {@link signHeader} if you need to keep exact bytes.
 */
export async function signMessage(raw: string | Uint8Array, options: SignOptions): Promise<string> {
  const { header } = await build(raw, options);
  const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
  const eol = text.includes("\r\n") || !text.includes("\n") ? "\r\n" : "\n";
  return (eol === "\n" ? header.replace(/\r\n/g, "\n") : header) + eol + text;
}
