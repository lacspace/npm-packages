/**
 * buildMime — assemble an RFC 5322 / 2045 message string (CRLF line endings).
 * Structure: mixed( alternative( text, related( html, inline cids ) ), attachments ),
 * collapsing any level that is not needed.
 */

import type { AddressInput } from "./address";

import { formatAddress, toAddressList } from "./address";
import { encodeBase64, encodeQuotedPrintable, randomHex, utf8 } from "./bytes";
import { MimeError, assertNoCRLF, encodeHeader, encodeWord, foldList } from "./words";

export interface BuildAttachment {
  filename: string;
  /** Bytes, or a string (encoded as UTF-8). */
  content: Uint8Array | string;
  contentType?: string;
  /** Content-ID without angle brackets; referenced from HTML as `cid:…`. */
  contentId?: string;
  disposition?: "attachment" | "inline";
}

export interface BuildMail {
  from: AddressInput;
  to?: AddressInput;
  cc?: AddressInput;
  /** Accepted for convenience; never written as a header. */
  bcc?: AddressInput;
  replyTo?: AddressInput;
  subject?: string;
  text?: string;
  html?: string;
  attachments?: BuildAttachment[];
  inReplyTo?: string;
  references?: string | string[];
  headers?: Record<string, string | string[]>;
  date?: Date;
  messageId?: string;
}

/** Fold a base64 string into 76-column CRLF lines. */
export function wrap76(b64: string): string {
  return b64.replace(/.{1,76}/g, "$&\r\n").replace(/\r\n$/, "");
}

/** Format a Date as an RFC 5322 `Date:` value with a numeric offset (local time). */
export function rfc2822Date(d: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n: number) => (n < 10 ? "0" + n : String(n));
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return `${days[d.getDay()]}, ${pad(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}:${pad(d.getSeconds())} ${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
}

/**
 * Generate a Message-ID `<random@domain>`. Randomness comes from
 * crypto.getRandomValues when available, else Math.random (unique enough for
 * an identifier, not for secrets).
 */
export function generateMessageId(domain = "localhost"): string {
  const d = /^[A-Za-z0-9.-]+$/.test(domain) ? domain : "localhost";
  return `<${Date.now().toString(36)}.${randomHex(12)}@${d}>`;
}

const MIME_TYPES: Record<string, string> = {
  txt: "text/plain",
  html: "text/html",
  htm: "text/html",
  csv: "text/csv",
  ics: "text/calendar",
  json: "application/json",
  pdf: "application/pdf",
  zip: "application/zip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  eml: "message/rfc822",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
};

/** Guess a content type from a filename's extension. */
export function guessContentType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

const boundary = (tag: string) => `----=_${tag}_${randomHex(12)}`;

function fileParam(name: string): string {
  if (/[^\x20-\x7e]/.test(name)) return `"${encodeWord(name).replace(/\r\n /g, " ")}"`;
  return `"${name.replace(/[\\"]/g, "\\$&")}"`;
}

function rfc2231(name: string): string[] {
  if (!/[^\x20-\x7e]/.test(name)) return [];
  const pct = Array.from(utf8(name), (b) =>
    /[A-Za-z0-9!#$&+.^_`|~-]/.test(String.fromCharCode(b)) ? String.fromCharCode(b) : "%" + b.toString(16).toUpperCase().padStart(2, "0"),
  ).join("");
  const parts = pct.match(/(%[0-9A-F]{2}|[^%]){1,60}/g) ?? [];
  if (parts.length === 1) return [`filename*=UTF-8''${parts[0]}`];
  return parts.map((p, i) => `filename*${i}*=${i === 0 ? "UTF-8''" : ""}${p}`);
}

function params(head: string, list: string[]): string {
  const one = [head, ...list].join("; ");
  return one.length <= 78 && !one.includes("\r\n") ? one : [head, ...list].join(";\r\n ");
}

function attachmentPart(att: BuildAttachment, forceInline: boolean): string {
  assertNoCRLF(att.filename, "attachment filename");
  const bytes = typeof att.content === "string" ? utf8(att.content) : att.content;
  const type = assertNoCRLF(att.contentType ?? guessContentType(att.filename), "attachment content type");
  if (!/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+(\s*;.*)?$/.test(type)) throw new MimeError(`invalid content type: ${type}`);
  const disposition = forceInline ? "inline" : att.disposition ?? (att.contentId ? "inline" : "attachment");
  const lines = [
    params(`Content-Type: ${type}`, [`name=${fileParam(att.filename)}`]),
    `Content-Transfer-Encoding: base64`,
    params(`Content-Disposition: ${disposition}`, [`filename=${fileParam(att.filename)}`, ...rfc2231(att.filename)]),
  ];
  if (att.contentId) {
    const cid = assertNoCRLF(att.contentId, "attachment contentId").replace(/^<|>$/g, "");
    if (/[<>\s]/.test(cid)) throw new MimeError(`invalid contentId: ${cid}`);
    lines.push(`Content-ID: <${cid}>`);
  }
  return `${lines.join("\r\n")}\r\n\r\n${wrap76(encodeBase64(bytes))}`;
}

/** text/plain or text/html leaf, choosing 7bit / quoted-printable / base64. */
function textPart(subtype: "plain" | "html", body: string): string {
  const normal = body.replace(/\r\n|\r|\n/g, "\r\n");
  const ascii = !/[^\x00-\x7f]/.test(normal);
  const shortLines = normal.split("\r\n").every((l) => l.length <= 76);
  let cte: string;
  let encoded: string;
  if (ascii && shortLines) {
    cte = "7bit";
    encoded = normal;
  } else {
    const bytes = utf8(normal);
    let high = 0;
    for (const b of bytes) if (b > 0x7f) high++;
    if (high / Math.max(1, bytes.length) > 0.3) {
      cte = "base64";
      encoded = wrap76(encodeBase64(bytes));
    } else {
      cte = "quoted-printable";
      encoded = encodeQuotedPrintable(normal);
    }
  }
  return `Content-Type: text/${subtype}; charset=UTF-8\r\nContent-Transfer-Encoding: ${cte}\r\n\r\n${encoded}`;
}

function multipart(sub: string, parts: string[]): string {
  const b = boundary(sub.slice(0, 3));
  return `Content-Type: multipart/${sub};\r\n boundary="${b}"\r\n\r\n` + parts.map((p) => `--${b}\r\n${p}\r\n`).join("") + `--${b}--\r\n`;
}

const RESERVED = new Set([
  "from", "to", "cc", "bcc", "reply-to", "subject", "date", "message-id", "in-reply-to", "references",
  "mime-version", "content-type", "content-transfer-encoding",
]);

function msgIds(v: string | string[] | undefined, label: string): string[] {
  if (!v) return [];
  const list = (Array.isArray(v) ? v : [v]).flatMap((s) => assertNoCRLF(s, label).split(/\s+/));
  return list
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const id = s.replace(/^<|>$/g, "");
      if (/[<>\s]/.test(id) || !id) throw new MimeError(`invalid ${label}: ${s}`);
      return `<${id}>`;
    });
}

/**
 * Build a complete MIME message. Throws {@link MimeError} on CR/LF in any
 * header value, bad header names or malformed ids — never emits an injected header.
 */
export function buildMime(mail: BuildMail): string {
  const from = toAddressList(mail.from);
  if (!from.length) throw new MimeError("from is required");
  const to = toAddressList(mail.to);
  const cc = toAddressList(mail.cc);
  toAddressList(mail.bcc); // validated, never written
  const replyTo = toAddressList(mail.replyTo);
  const subject = assertNoCRLF(mail.subject ?? "", "subject");

  const domain = from[0]!.address.split("@")[1] ?? "localhost";
  for (const [label, v] of [["messageId", mail.messageId], ["inReplyTo", mail.inReplyTo]] as const)
    if (v && /\s/.test(v.trim())) throw new MimeError(`invalid ${label}: ${JSON.stringify(v)}`);
  const messageId = mail.messageId ? msgIds(mail.messageId, "messageId")[0]! : generateMessageId(domain);
  const inReplyTo = msgIds(mail.inReplyTo, "inReplyTo")[0];
  const references = msgIds(mail.references, "references");

  const h: string[] = [];
  h.push(`Date: ${rfc2822Date(mail.date ?? new Date())}`);
  h.push(`From: ${foldList(from.map(formatAddress))}`);
  if (from.length > 1) h.push(`Sender: ${formatAddress(from[0]!)}`);
  if (replyTo.length) h.push(`Reply-To: ${foldList(replyTo.map(formatAddress))}`);
  if (to.length) h.push(`To: ${foldList(to.map(formatAddress))}`);
  else if (!cc.length) h.push(`To: undisclosed-recipients:;`);
  if (cc.length) h.push(`Cc: ${foldList(cc.map(formatAddress))}`);
  h.push(`Subject: ${encodeHeader(subject)}`);
  h.push(`Message-ID: ${messageId}`);
  if (inReplyTo) h.push(`In-Reply-To: ${inReplyTo}`);
  if (references.length) h.push(`References: ${foldList(references, 66, "")}`);
  h.push(`MIME-Version: 1.0`);
  for (const [k, raw] of Object.entries(mail.headers ?? {})) {
    if (!/^[!-9;-~]+$/.test(k)) throw new MimeError(`invalid header name: ${JSON.stringify(k)}`);
    if (RESERVED.has(k.toLowerCase())) throw new MimeError(`header ${k} is set by buildMime; use the matching field`);
    for (const v of Array.isArray(raw) ? raw : [raw]) h.push(`${k}: ${encodeHeader(assertNoCRLF(String(v), `header ${k}`))}`);
  }

  const atts = mail.attachments ?? [];
  const hasHtml = mail.html !== undefined && mail.html !== "";
  const inline = hasHtml ? atts.filter((a) => a.contentId && a.disposition !== "attachment") : [];
  const regular = atts.filter((a) => !inline.includes(a));

  let htmlBlock: string | null = hasHtml ? textPart("html", mail.html!) : null;
  if (htmlBlock && inline.length) htmlBlock = multipart("related", [htmlBlock, ...inline.map((a) => attachmentPart(a, true))]);
  const textBlock = mail.text !== undefined && mail.text !== "" ? textPart("plain", mail.text) : null;

  let body: string;
  if (textBlock && htmlBlock) body = multipart("alternative", [textBlock, htmlBlock]);
  else body = htmlBlock ?? textBlock ?? `Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 7bit\r\n\r\n`;
  if (regular.length) body = multipart("mixed", [body.replace(/\r\n$/, ""), ...regular.map((a) => attachmentPart(a, false))]);

  return h.join("\r\n") + "\r\n" + body;
}
