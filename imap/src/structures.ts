import type { Address, BodyStructureNode, Envelope } from "./types.js";
import { type ImapToken, tokList, tokNumber, tokString } from "./parser.js";
import { decodeParams, decodeWords } from "./rfc2047.js";

function parseAddresses(t: ImapToken | undefined): Address[] {
  const list = tokList(t);
  if (!list) return [];
  const out: Address[] = [];
  for (const item of list) {
    const a = tokList(item);
    if (!a) continue;
    const name = tokString(a[0]);
    const mailbox = tokString(a[2]);
    const host = tokString(a[3]);
    // RFC 3501 group syntax: host NIL = group start (mailbox = group name) / end (mailbox NIL)
    if (host === null) continue;
    out.push({
      name: name ? decodeWords(name) : "",
      address: mailbox !== null ? (host ? `${mailbox}@${host}` : mailbox) : "",
    });
  }
  return out;
}

export function parseEmailDate(s: string | null): Date | null {
  if (!s) return null;
  const cleaned = s.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  let t = Date.parse(cleaned);
  if (Number.isNaN(t)) {
    // "Mon, 7 Oct 2026 10:00:00 +0545" variants Date.parse dislikes: drop weekday
    t = Date.parse(cleaned.replace(/^[A-Za-z]{3},?\s*/, ""));
  }
  return Number.isNaN(t) ? null : new Date(t);
}

/** ENVELOPE list → Envelope (subject/names RFC 2047 decoded). */
export function parseEnvelope(t: ImapToken | undefined): Envelope {
  const l = tokList(t) ?? [];
  const env: Envelope = {
    date: parseEmailDate(tokString(l[0])),
    from: parseAddresses(l[2]),
    sender: parseAddresses(l[3]),
    replyTo: parseAddresses(l[4]),
    to: parseAddresses(l[5]),
    cc: parseAddresses(l[6]),
    bcc: parseAddresses(l[7]),
  };
  const subject = tokString(l[1]);
  if (subject !== null) env.subject = decodeWords(subject);
  const irt = tokString(l[8]);
  if (irt) env.inReplyTo = irt.trim();
  const mid = tokString(l[9]);
  if (mid) env.messageId = mid.trim();
  return env;
}

function paramList(t: ImapToken | undefined): Record<string, string> {
  const l = tokList(t);
  if (!l) return {};
  const pairs: [string, string][] = [];
  for (let i = 0; i + 1 < l.length; i += 2) {
    const k = tokString(l[i]);
    if (k === null) continue;
    pairs.push([k, tokString(l[i + 1]) ?? ""]);
  }
  return decodeParams(pairs);
}

function applyExtensions(node: BodyStructureNode, l: ImapToken[], i: number): void {
  // body-fld-dsp
  const dsp = tokList(l[i]);
  if (dsp) {
    const type = tokString(dsp[0]);
    if (type) node.disposition = { type: type.toLowerCase(), params: paramList(dsp[1]) };
  } else {
    // some servers send a bare string disposition
    const s = tokString(l[i]);
    if (s) node.disposition = { type: s.toLowerCase(), params: {} };
  }
  // body-fld-lang
  const lang = l[i + 1];
  const langList = tokList(lang);
  if (langList) {
    const v = langList.map((x) => tokString(x)).filter((x): x is string => !!x);
    if (v.length) node.language = v;
  } else {
    const s = tokString(lang);
    if (s) node.language = [s];
  }
  const loc = tokString(l[i + 2]);
  if (loc) node.location = loc;
}

/** Token → plain nested arrays of string | null (the @lacspace/mime s-expression shape). */
export function rawSexp(t: ImapToken | undefined): unknown {
  if (!t) return null;
  if (t.type === "list") return t.value.map(rawSexp);
  return tokString(t);
}

function childId(parent: string, n: number): string {
  return parent ? `${parent}.${n}` : String(n);
}

function parseNode(l: ImapToken[], partId: string): BodyStructureNode {
  if (l[0] && l[0].type === "list") {
    let i = 0;
    const kids: ImapToken[][] = [];
    while (i < l.length && l[i] && l[i]!.type === "list") kids.push((l[i] as { value: ImapToken[] }).value), i++;
    const node: BodyStructureNode = {
      partId,
      type: "multipart",
      subtype: (tokString(l[i]) ?? "mixed").toLowerCase(),
      params: {},
      children: [],
    };
    i++;
    node.children = kids.map((k, idx) => parseNode(k, childId(partId, idx + 1)));
    if (i < l.length) {
      node.params = paramList(l[i]);
      applyExtensions(node, l, i + 1);
    }
    return node;
  }
  const node: BodyStructureNode = {
    partId,
    type: (tokString(l[0]) ?? "application").toLowerCase(),
    subtype: (tokString(l[1]) ?? "octet-stream").toLowerCase(),
    params: paramList(l[2]),
  };
  const id = tokString(l[3]);
  if (id) node.id = id; // Content-ID keeps its angle brackets
  const desc = tokString(l[4]);
  if (desc) node.description = decodeWords(desc);
  node.encoding = (tokString(l[5]) ?? "7bit").toLowerCase();
  const size = tokNumber(l[6]);
  if (size !== undefined) node.size = size;
  let i = 7;
  if (node.type === "text") {
    const lines = tokNumber(l[7]);
    if (lines !== undefined) node.lines = lines;
    i = 8;
  } else if (node.type === "message" && (node.subtype === "rfc822" || node.subtype === "global") && tokList(l[8])) {
    // envelope stays the raw parsed list (same as @lacspace/mime); use parseEnvelope() for a typed view
    node.envelope = rawSexp(l[7]);
    const child = tokList(l[8])!;
    const isMulti = !!(child[0] && child[0].type === "list");
    node.childNode = parseNode(child, isMulti ? partId : `${partId}.1`);
    const lines = tokNumber(l[9]);
    if (lines !== undefined) node.lines = lines;
    i = 10;
  }
  const md5 = tokString(l[i]);
  if (md5) node.md5 = md5;
  applyExtensions(node, l, i + 1);
  return node;
}

/**
 * BODYSTRUCTURE / BODY list → tree. Root single part is "1"; root multipart is ""
 * with children "1", "2"…; a message/rfc822 at "2" has childNode "2.1" (single) or a
 * multipart childNode "2" whose children are "2.1", "2.2" (RFC 3501 §6.4.5 section numbers).
 */
export function parseBodyStructure(t: ImapToken | undefined): BodyStructureNode | undefined {
  const l = tokList(t);
  if (!l || !l.length) return undefined;
  const multi = !!(l[0] && l[0].type === "list");
  return parseNode(l, multi ? "" : "1");
}
