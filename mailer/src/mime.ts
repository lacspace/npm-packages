/**
 * MIME message assembly — turns a {@link Mail} into an RFC 5322 / 2045 message
 * string. Handles `multipart/alternative` (text + html), `multipart/mixed`
 * (attachments), and `multipart/related` (inline CID images). Pure and
 * dependency-free (only `node:crypto` for the multipart boundary token).
 */

import { randomBytes } from "node:crypto";

import type { Address, Attachment, Mail } from "./index";

import { assertNoCRLF, encodeHeader, encodeWord, foldList, formatAddress, toAddress, toList } from "./address";

/** Fold a base64 string into RFC-2045 76-column lines. */
export function wrap76(b64: string): string {
  return b64.replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

/** Format a Date as an RFC 2822 `Date:` header value with a numeric offset. */
export function rfc2822Date(d: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n: number) => (n < 10 ? "0" + n : String(n));
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return `${days[d.getDay()]}, ${pad(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
}

/** Dot-stuff a message body for the SMTP DATA command (leading `.` → `..`). */
export function dotStuff(message: string): string {
  return message.replace(/^\./gm, "..");
}

/** Coerce attachment content (string / base64 / Buffer / Uint8Array) to a Buffer. */
function attachmentBuffer(att: Attachment): Buffer {
  if (Buffer.isBuffer(att.content)) return att.content;
  if (att.content instanceof Uint8Array) return Buffer.from(att.content);
  return Buffer.from(att.content, att.encoding ?? "utf8");
}

/**
 * A quoted filename parameter. `\` and `"` are escaped so a filename can't close
 * the quotes and add parameters. Non-ASCII names use an encoded word, which
 * Gmail, Outlook and Apple Mail all read in this position.
 */
function fileParam(name: string): string {
  if (/[^\x20-\x7e]/.test(name)) return `"${encodeWord(name).replace(/\r\n /g, " ")}"`;
  return `"${name.replace(/[\\"]/g, "\\$&")}"`;
}

/** RFC 2231 `filename*` for non-ASCII names, the standard form, which wins where supported. */
function rfc2231(name: string): string[] {
  if (!/[^\x20-\x7e]/.test(name)) return [];
  const pct = Array.from(Buffer.from(name, "utf8"), (b) =>
    /[A-Za-z0-9!#$&+.^_`|~-]/.test(String.fromCharCode(b)) ? String.fromCharCode(b) : "%" + b.toString(16).toUpperCase().padStart(2, "0"),
  ).join("");
  // Continuations (filename*0*, filename*1*, …) keep every line short.
  const parts = pct.match(/(%[0-9A-F]{2}|[^%]){1,60}/g) ?? [];
  if (parts.length === 1) return [`filename*=UTF-8''${parts[0]}`];
  return parts.map((p, i) => `filename*${i}*=${i === 0 ? "UTF-8''" : ""}${p}`);
}

/** `Header: value; a=1; b=2` on one line when it fits in 78, else one parameter per folded line. */
function params(head: string, list: string[]): string {
  const one = [head, ...list].join("; ");
  return one.length <= 78 && !one.includes("\r\n") ? one : [head, ...list].join(";\r\n ");
}

/** Render one attachment/inline MIME part. */
function attachmentPart(att: Attachment): string {
  assertNoCRLF(att.filename, "attachment filename");
  const buf = attachmentBuffer(att);
  const type = assertNoCRLF(att.contentType ?? "application/octet-stream", "attachment content type");
  const disposition = att.cid ? "inline" : (att.contentDisposition ?? "attachment");
  const lines = [
    params(`Content-Type: ${type}`, [`name=${fileParam(att.filename)}`]),
    `Content-Transfer-Encoding: base64`,
    params(`Content-Disposition: ${disposition}`, [`filename=${fileParam(att.filename)}`, ...rfc2231(att.filename)]),
  ];
  if (att.cid) lines.push(`Content-ID: <${assertNoCRLF(att.cid, "attachment cid")}>`);
  return `${lines.join("\r\n")}\r\n\r\n${wrap76(buf.toString("base64"))}`;
}

const boundary = (tag: string) => `----=_${tag}_${randomBytes(12).toString("hex")}`;

/** Build the message body (below the headers): the text/html/alternative block. */
function bodyBlock(mail: Mail): string {
  const textPart = mail.text
    ? `Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(
        Buffer.from(mail.text, "utf8").toString("base64"),
      )}`
    : null;
  const htmlPart = mail.html
    ? `Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(
        Buffer.from(mail.html, "utf8").toString("base64"),
      )}`
    : null;

  if (textPart && htmlPart) {
    const b = boundary("alt");
    return (
      `Content-Type: multipart/alternative; boundary="${b}"\r\n\r\n` +
      `--${b}\r\n${textPart}\r\n--${b}\r\n${htmlPart}\r\n--${b}--`
    );
  }
  return htmlPart ?? textPart ?? `Content-Type: text/plain; charset=UTF-8\r\n\r\n`;
}

/**
 * Assemble the full MIME message for `mail`. Chooses the narrowest correct
 * structure: bare body, `multipart/related` when inline (CID) attachments are
 * present, and `multipart/mixed` when regular attachments are present.
 */
export function buildMime(mail: Mail, from: Address, messageId: string): string {
  const to = toList(mail.to);
  const cc = toList(mail.cc);
  const headers: string[] = [];

  headers.push(`From: ${formatAddress(from)}`);
  headers.push(`To: ${foldList(to.map(formatAddress))}`);
  if (cc.length) headers.push(`Cc: ${foldList(cc.map(formatAddress))}`);
  if (mail.replyTo) headers.push(`Reply-To: ${formatAddress(toAddress(mail.replyTo))}`);
  headers.push(`Subject: ${encodeHeader(assertNoCRLF(mail.subject, "subject"))}`);
  headers.push(`Date: ${rfc2822Date(new Date())}`);
  headers.push(`Message-ID: ${messageId}`);
  headers.push(`MIME-Version: 1.0`);
  for (const [k, v] of Object.entries(mail.headers ?? {}))
    headers.push(`${assertNoCRLF(k, "header name")}: ${assertNoCRLF(v, "header value")}`);

  const attachments = mail.attachments ?? [];
  const inline = attachments.filter((a) => a.cid);
  const regular = attachments.filter((a) => !a.cid);

  // Body, wrapped in multipart/related when inline images are present.
  let content = bodyBlock(mail);
  if (inline.length) {
    const b = boundary("rel");
    const parts = [`--${b}\r\n${content}`, ...inline.map((a) => `--${b}\r\n${attachmentPart(a)}`)];
    content =
      `Content-Type: multipart/related; boundary="${b}"\r\n\r\n` + parts.join("\r\n") + `\r\n--${b}--`;
  }

  if (regular.length) {
    const b = boundary("mix");
    const parts = [`--${b}\r\n${content}`, ...regular.map((a) => `--${b}\r\n${attachmentPart(a)}`)];
    return (
      headers.join("\r\n") +
      `\r\nContent-Type: multipart/mixed; boundary="${b}"\r\n\r\n` +
      parts.join("\r\n") +
      `\r\n--${b}--`
    );
  }

  return headers.join("\r\n") + "\r\n" + content;
}
