/**
 * parseMime — RFC 5322 / 2045–2049 message parser. Best-effort and total:
 * malformed input yields a partial result, never an exception.
 */

import type { Address, Attachment, ListUnsubscribe, ParsedMail, ParseOptions, PartNode } from "./types";

import { parseAddressList } from "./address";
import {
  binaryToBytes,
  bytesToBinary,
  decodeBase64,
  decodeCharset,
  decodeQuotedPrintable,
  tryUtf8,
  utf8,
} from "./bytes";
import { MailHeaders, parseHeaderBinary, parseHeaderParams, splitEntity } from "./headers";
import { classify, defaultFilename, isMessagePart } from "./tree";

interface Ctx {
  count: number;
  maxParts: number;
  maxDepth: number;
  fromString: boolean;
  truncated: boolean;
}

const childId = (prefix: string, i: number) => (prefix ? `${prefix}.${i}` : String(i));

/** Undo a Content-Transfer-Encoding on a body given as a binary string. */
export function transferDecode(body: string, encoding: string | undefined): Uint8Array {
  const enc = (encoding ?? "").trim().replace(/^["']|["']$/g, "").toLowerCase();
  if (enc === "base64" || enc === "base-64") return decodeBase64(body);
  if (enc === "quoted-printable" || enc === "quotedprintable") return decodeQuotedPrintable(body);
  return binaryToBytes(body);
}

/** Split a multipart body on its boundary. Tolerates a missing close delimiter. */
export function splitMultipart(body: string, boundary: string): string[] {
  const delim = "--" + boundary;
  const parts: string[] = [];
  let start = -1;
  let idx = body.indexOf(delim);
  while (idx >= 0) {
    if (idx === 0 || body[idx - 1] === "\n") {
      const after = idx + delim.length;
      const isClose = body.startsWith("--", after);
      const k = isClose ? after + 2 : after;
      let eol = body.indexOf("\n", k);
      if (eol < 0) eol = body.length;
      if (/^[ \t\r]*$/.test(body.slice(k, eol))) {
        if (start >= 0) {
          let end = idx;
          if (body[end - 1] === "\n") end--;
          if (body[end - 1] === "\r") end--;
          parts.push(body.slice(start, Math.max(start, end)));
        }
        if (isClose) return parts;
        start = Math.min(eol + 1, body.length);
      }
    }
    idx = body.indexOf(delim, idx + delim.length);
  }
  if (start >= 0) parts.push(body.slice(start));
  return parts;
}

function guessBoundary(body: string): string | undefined {
  const m = /(?:^|\n)--([^\s][^\r\n]{0,200}?)[ \t]*\r?\n/.exec(body);
  return m ? m[1]!.replace(/--$/, "") : undefined;
}

function parseEntity(bin: string, idMulti: string, idSingle: string, depth: number, ctx: Ctx, defaultType = "text/plain"): PartNode {
  ctx.count++;
  const { head, body } = splitEntity(bin);
  const headers = parseHeaderBinary(head);
  const ct = parseHeaderParams(headers.raw("content-type"));
  let [type, subtype] = ct.value.split("/").map((s) => s.trim());
  if (!type || !subtype || /\s/.test(type)) [type, subtype] = defaultType.split("/") as [string, string];
  const encoding = (headers.get("content-transfer-encoding") ?? "7bit").trim().toLowerCase();
  const node: PartNode = {
    partId: type === "multipart" ? idMulti : idSingle,
    type: type!,
    subtype: subtype!,
    params: ct.params,
    encoding,
    size: body.length,
    contentType: `${type}/${subtype}`,
    isAttachment: false,
    isInline: false,
    headers,
  };
  const cid = headers.get("content-id");
  if (cid) node.id = cid;
  const desc = headers.get("content-description");
  if (desc) node.description = desc;
  const md5 = headers.get("content-md5");
  if (md5) node.md5 = md5;
  const loc = headers.get("content-location");
  if (loc) node.location = loc.replace(/\s+/g, "");
  const lang = headers.get("content-language");
  if (lang) node.language = lang.split(",").map((s) => s.trim()).filter(Boolean);
  const disp = parseHeaderParams(headers.raw("content-disposition"));
  if (disp.value) node.disposition = { type: disp.value, params: disp.params };
  const fn = node.disposition?.params.filename ?? node.params.name;
  if (fn) node.filename = fn;

  if (type === "multipart") {
    if (depth >= ctx.maxDepth) {
      ctx.truncated = true;
      node.children = [];
      return node;
    }
    const boundary = node.params.boundary || guessBoundary(body);
    const parts = boundary ? splitMultipart(body, boundary) : [];
    if (!parts.length) {
      // Not really multipart: keep the body readable as text.
      node.type = "text";
      node.subtype = "plain";
      node.contentType = "text/plain";
      node.partId = idSingle;
      node.content = transferDecode(body, encoding);
      return node;
    }
    const childDefault = subtype === "digest" ? "message/rfc822" : "text/plain";
    node.children = [];
    for (let i = 0; i < parts.length; i++) {
      if (ctx.count >= ctx.maxParts) {
        ctx.truncated = true;
        break;
      }
      const id = childId(idMulti, i + 1);
      node.children.push(parseEntity(parts[i]!, id, id, depth + 1, ctx, childDefault));
    }
    return node;
  }

  const content = transferDecode(body, encoding);
  node.content = content;
  if (isMessagePart(node)) {
    if (depth >= ctx.maxDepth || ctx.count >= ctx.maxParts) {
      ctx.truncated = true;
      return node;
    }
    const innerBin = encoding === "base64" || encoding === "quoted-printable" ? bytesToBinary(content) : body;
    node.childNode = parseEntity(innerBin, node.partId, childId(node.partId, 1), depth + 1, ctx);
  }
  return node;
}

/* ------------------------------ fields ------------------------------ */

const ZONES: Record<string, number> = { UT: 0, UTC: 0, GMT: 0, Z: 0, EST: -300, EDT: -240, CST: -360, CDT: -300, MST: -420, MDT: -360, PST: -480, PDT: -420 };
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Parse an RFC 5322 date (tolerant of comments, 2-digit years, named zones). */
export function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const v = value.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const m = /(\d{1,2})\s*[- ]\s*([A-Za-z]{3})[a-z]*\.?\s*[- ]\s*(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([+-]\d{2}:?\d{2}|[A-Za-z]{1,5})?/.exec(v);
  if (m) {
    const mon = MONTHS.indexOf(m[2]!.toLowerCase());
    if (mon >= 0) {
      let year = parseInt(m[3]!, 10);
      if (m[3]!.length <= 2) year += year < 50 ? 2000 : 1900;
      else if (m[3]!.length === 3) year += 1900;
      let off = 0;
      const z = m[7];
      if (z && /^[+-]/.test(z)) {
        const d = z.replace(":", "");
        off = (d[0] === "-" ? -1 : 1) * (parseInt(d.slice(1, 3), 10) * 60 + parseInt(d.slice(3, 5), 10));
      } else if (z) off = ZONES[z.toUpperCase()] ?? 0;
      const t = Date.UTC(year, mon, parseInt(m[1]!, 10), parseInt(m[4]!, 10), parseInt(m[5]!, 10), m[6] ? parseInt(m[6], 10) : 0) - off * 60000;
      if (!Number.isNaN(t)) return new Date(t);
    }
  }
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t);
}

/** Extract `<msg-id>` tokens from a header value. */
export function parseMessageIds(value: string | undefined): string[] {
  if (!value) return [];
  const ids = value.match(/<[^<>\s]+>/g);
  if (ids) return ids;
  return value.split(/[\s,]+/).filter((s) => s.includes("@")).map((s) => `<${s.replace(/^<|>$/g, "")}>`);
}

function parsePriority(h: MailHeaders): "high" | "normal" | "low" {
  const xp = h.get("x-priority");
  if (xp) {
    const n = parseInt(xp, 10);
    if (n === 1 || n === 2) return "high";
    if (n === 4 || n === 5) return "low";
    if (/high/i.test(xp)) return "high";
    if (/low/i.test(xp)) return "low";
  }
  const imp = (h.get("importance") ?? h.get("x-msmail-priority") ?? "").toLowerCase();
  if (imp.startsWith("high")) return "high";
  if (imp.startsWith("low")) return "low";
  const pr = (h.get("priority") ?? "").toLowerCase();
  if (pr === "urgent") return "high";
  if (pr === "non-urgent") return "low";
  return "normal";
}

function parseListUnsubscribe(h: MailHeaders): ListUnsubscribe | undefined {
  const v = h.get("list-unsubscribe");
  if (!v) return undefined;
  const items = (v.match(/<[^>]*>/g) ?? v.split(",")).map((s) => s.replace(/^\s*<|>\s*$/g, "").replace(/\s+/g, "")).filter(Boolean);
  const urls = items.filter((u) => /^https?:\/\//i.test(u));
  const mailto = items.find((u) => /^mailto:/i.test(u));
  const post = h.get("list-unsubscribe-post") ?? "";
  const out: ListUnsubscribe = { urls, oneClick: /list-unsubscribe\s*=\s*one-click/i.test(post) && urls.length > 0 };
  if (mailto) out.mailto = mailto;
  if (!urls.length && !mailto) return undefined;
  return out;
}

function textOf(n: PartNode, ctx: Ctx): string {
  const bytes = n.content ?? new Uint8Array(0);
  if (ctx.fromString && n.encoding !== "base64" && n.encoding !== "quoted-printable") {
    // String input was UTF-8 encoded on entry; raw 8-bit text is therefore UTF-8.
    const u = tryUtf8(bytes);
    if (u !== null) return u;
  }
  return decodeCharset(bytes, n.params.charset);
}

const stripAngle = (s: string) => s.trim().replace(/^<|>$/g, "");

function toAttachment(n: PartNode, inline: boolean, ctx: Ctx): Attachment {
  const content = n.content ?? new Uint8Array(0);
  const a: Attachment = {
    partId: n.partId,
    filename: n.filename ?? "",
    contentType: n.contentType,
    disposition: inline ? "inline" : "attachment",
    size: content.length,
    content,
  };
  if (n.id) a.contentId = stripAngle(n.id);
  if (n.params.charset) a.charset = n.params.charset;
  if (isMessagePart(n) && n.childNode) {
    a.message = buildParsed(n.childNode, ctx);
    if (!a.filename) {
      const subj = a.message.subject.replace(/[\\/:*?"<>|\x00-\x1f]+/g, "_").trim().slice(0, 100);
      a.filename = (subj || "message") + ".eml";
    }
  }
  if (!a.filename) a.filename = defaultFilename(n);
  return a;
}

function buildParsed(root: PartNode, ctx: Ctx): ParsedMail {
  const h = root.headers ?? new MailHeaders();
  const list = (name: string): Address[] => h.rawAll(name).flatMap((v) => parseAddressList(v));
  const s = classify(root);
  const join = (nodes: PartNode[]) => (nodes.length ? nodes.map((n) => textOf(n, ctx)).join("\n") : undefined);
  const out: ParsedMail = {
    headers: h,
    from: list("from")[0] ?? null,
    sender: list("sender")[0] ?? null,
    replyTo: list("reply-to"),
    to: list("to"),
    cc: list("cc"),
    bcc: list("bcc"),
    subject: h.get("subject") ?? "",
    date: parseDate(h.get("date")),
    references: parseMessageIds(h.getAll("references").join(" ")),
    attachments: s.attachments.map((n) => toAttachment(n, false, ctx)),
    inline: s.inline.map((n) => toAttachment(n, true, ctx)),
    priority: parsePriority(h),
    parts: root,
  };
  const mid = parseMessageIds(h.get("message-id"))[0];
  if (mid) out.messageId = mid;
  const irt = parseMessageIds(h.get("in-reply-to"))[0];
  if (irt) out.inReplyTo = irt;
  const text = join(s.text);
  const html = join(s.html);
  if (text !== undefined) out.text = text;
  if (html !== undefined) out.html = html;
  const lu = parseListUnsubscribe(h);
  if (lu) out.listUnsubscribe = lu;
  return out;
}

function toBinary(raw: string | Uint8Array): { bin: string; fromString: boolean } {
  if (typeof raw !== "string") return { bin: bytesToBinary(raw instanceof Uint8Array ? raw : new Uint8Array(0)), fromString: false };
  if (/[^\x00-\x7f]/.test(raw)) return { bin: bytesToBinary(utf8(raw)), fromString: true };
  return { bin: raw, fromString: false };
}

/**
 * Parse a raw RFC 5322 message (string or bytes). Never throws: malformed
 * input produces a best-effort result.
 */
export function parseMime(raw: string | Uint8Array, opts: ParseOptions = {}): ParsedMail {
  const ctx: Ctx = {
    count: 0,
    maxParts: opts.maxParts ?? 500,
    maxDepth: opts.maxDepth ?? 20,
    fromString: false,
    truncated: false,
  };
  try {
    let { bin, fromString } = toBinary(raw ?? "");
    ctx.fromString = fromString;
    if (opts.maxSize !== undefined && bin.length > opts.maxSize) {
      bin = bin.slice(0, Math.max(0, opts.maxSize));
      ctx.truncated = true;
    }
    // Drop an mbox "From " envelope line.
    if (bin.startsWith("From ")) bin = bin.slice(bin.indexOf("\n") + 1 || bin.length);
    const root = parseEntity(bin, "", "1", 0, ctx);
    const out = buildParsed(root, ctx);
    if (ctx.truncated) out.truncated = true;
    return out;
  } catch {
    const parts: PartNode = { partId: "1", type: "text", subtype: "plain", params: {}, contentType: "text/plain", isAttachment: false, isInline: false };
    return {
      headers: new MailHeaders(),
      from: null,
      sender: null,
      replyTo: [],
      to: [],
      cc: [],
      bcc: [],
      subject: "",
      date: null,
      references: [],
      attachments: [],
      inline: [],
      priority: "normal",
      parts,
      truncated: true,
    };
  }
}
