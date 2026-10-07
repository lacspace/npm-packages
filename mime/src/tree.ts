/**
 * Structural classification of a MIME tree — which parts are the readable
 * body (text / html), which are attachments and which are inline (cid)
 * resources. Works identically on trees from parseMime and from IMAP
 * BODYSTRUCTURE, so a webmail can decide what to fetch before fetching it.
 */

import type { BodyStructureNode, PartNode } from "./types";

export interface Selection {
  text: PartNode[];
  html: PartNode[];
  attachments: PartNode[];
  inline: PartNode[];
  /** message/rfc822 parts (also in `attachments`). */
  messages: PartNode[];
}

const sel = (): Selection => ({ text: [], html: [], attachments: [], inline: [], messages: [] });

/** True for message/rfc822 and message/global (encapsulated messages). */
export function isMessagePart(n: BodyStructureNode): boolean {
  return n.type === "message" && (n.subtype === "rfc822" || n.subtype === "global");
}

function walk(node: PartNode, s: Selection, relatedResource: boolean): void {
  if (node.type === "multipart") {
    const kids = node.children ?? [];
    switch (node.subtype) {
      case "alternative": {
        const subs = kids.map((k) => {
          const x = sel();
          walk(k, x, false);
          return x;
        });
        let h = -1;
        let t = -1;
        subs.forEach((x, i) => {
          if (x.html.length) h = i;
          if (x.text.length) t = i;
        });
        if (h >= 0) s.html.push(...subs[h]!.html);
        if (t >= 0) s.text.push(...subs[t]!.text);
        for (const x of subs) {
          s.attachments.push(...x.attachments);
          s.inline.push(...x.inline);
          s.messages.push(...x.messages);
        }
        return;
      }
      case "related": {
        const start = node.params.start?.replace(/^<|>$/g, "");
        let root = start ? kids.findIndex((k) => k.id?.replace(/^<|>$/g, "") === start) : 0;
        if (root < 0) root = 0;
        kids.forEach((k, i) => walk(k, s, i !== root));
        return;
      }
      case "signed":
        // multipart/signed: the first part is the signed content; the signature is not shown.
        if (kids[0]) walk(kids[0], s, relatedResource);
        return;
      default:
        for (const k of kids) walk(k, s, false);
        return;
    }
  }
  if (isMessagePart(node)) {
    s.attachments.push(node);
    s.messages.push(node);
    return;
  }
  const disp = node.disposition?.type;
  const isBodyText = node.type === "text" && (node.subtype === "plain" || node.subtype === "html");
  if (isBodyText && disp !== "attachment" && !node.filename) {
    (node.subtype === "html" ? s.html : s.text).push(node);
    return;
  }
  if ((relatedResource && disp !== "attachment") || (node.id && disp === "inline")) {
    s.inline.push(node);
    return;
  }
  s.attachments.push(node);
}

function clearFlags(n: PartNode): void {
  n.isAttachment = false;
  n.isInline = false;
  n.children?.forEach(clearFlags);
  if (n.childNode) clearFlags(n.childNode);
}

/**
 * Classify a tree (sets `isAttachment` / `isInline` on its nodes) and return
 * the selection. When the message itself has no text/html, the body of the
 * first attached message/rfc822 is used.
 */
export function classify(tree: PartNode): Selection {
  clearFlags(tree);
  return classifyInner(tree, 0);
}

function classifyInner(tree: PartNode, depth: number): Selection {
  const s = sel();
  walk(tree, s, false);
  for (const a of s.attachments) a.isAttachment = true;
  for (const a of s.inline) a.isInline = true;
  // flag parts inside encapsulated messages too
  const inner = depth < 50 ? s.messages.map((m) => (m.childNode ? classifyInner(m.childNode, depth + 1) : null)) : [];
  if (!s.text.length && !s.html.length) {
    for (const x of inner) {
      if (x && (x.text.length || x.html.length)) {
        s.text = x.text;
        s.html = x.html;
        break;
      }
    }
  }
  return s;
}

/** Fill derived fields and normalise casing on a structure node, recursively. */
export function finalizeNode(n: BodyStructureNode): PartNode {
  const node = n as PartNode;
  node.type = (node.type || "application").toLowerCase();
  node.subtype = (node.subtype || "octet-stream").toLowerCase();
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(node.params ?? {})) params[k.toLowerCase()] = v;
  node.params = params;
  if (node.encoding) node.encoding = node.encoding.toLowerCase();
  if (node.disposition) {
    const dp: Record<string, string> = {};
    for (const [k, v] of Object.entries(node.disposition.params ?? {})) dp[k.toLowerCase()] = v;
    node.disposition = { type: (node.disposition.type || "").toLowerCase(), params: dp };
  }
  node.contentType = `${node.type}/${node.subtype}`;
  const fn = node.disposition?.params.filename ?? node.params.name;
  if (fn) node.filename = fn;
  node.isAttachment = false;
  node.isInline = false;
  if (node.children) node.children = node.children.map(finalizeNode);
  if (node.childNode) node.childNode = finalizeNode(node.childNode);
  return node;
}

/**
 * The parts to fetch first: the chosen text/plain and text/html bodies
 * (respecting multipart/alternative preference).
 */
export function findTextParts(tree: BodyStructureNode | PartNode): { text?: PartNode; html?: PartNode } {
  const t = ensurePartNode(tree);
  const s = classify(t);
  const out: { text?: PartNode; html?: PartNode } = {};
  if (s.text[0]) out.text = s.text[0];
  if (s.html[0]) out.html = s.html[0];
  return out;
}

/**
 * Every attachment and inline resource, in tree order of discovery —
 * `isInline` distinguishes cid images from regular attachments. Fetch each
 * lazily by `partId`.
 */
export function listAttachments(tree: BodyStructureNode | PartNode): PartNode[] {
  const s = classify(ensurePartNode(tree));
  return [...s.attachments, ...s.inline];
}

function ensurePartNode(tree: BodyStructureNode | PartNode): PartNode {
  return "contentType" in tree && "isAttachment" in tree ? (tree as PartNode) : finalizeNode(clone(tree));
}

/** Deep-ish clone of a structure node (does not copy `content` bytes). */
export function clone(n: BodyStructureNode): BodyStructureNode {
  const c: BodyStructureNode = { ...n, params: { ...(n.params ?? {}) } };
  if (n.disposition) c.disposition = { type: n.disposition.type, params: { ...(n.disposition.params ?? {}) } };
  if (n.language) c.language = [...n.language];
  if (n.children) c.children = n.children.map(clone);
  if (n.childNode) c.childNode = clone(n.childNode);
  return c;
}

const EXT: Record<string, string> = {
  "text/plain": "txt",
  "text/html": "html",
  "text/calendar": "ics",
  "text/csv": "csv",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/json": "json",
  "message/rfc822": "eml",
  "message/delivery-status": "txt",
  "text/rfc822-headers": "txt",
  "application/pgp-signature": "asc",
  "application/pkcs7-signature": "p7s",
};

/** A filename for a part that has none. */
export function defaultFilename(n: PartNode): string {
  if (n.contentType === "text/calendar") return "invite.ics";
  const ext = EXT[n.contentType] ?? (n.subtype && /^[a-z0-9]{1,5}$/.test(n.subtype) ? n.subtype : "bin");
  return `part-${n.partId || "1"}.${ext}`;
}
