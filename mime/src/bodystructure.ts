/**
 * IMAP BODYSTRUCTURE (RFC 3501 §7.4.2) parser → {@link PartNode} tree, plus
 * decodePart for parts fetched by partId (`BODY.PEEK[1.2]`).
 */

import type { BodyStructureNode, PartNode } from "./types";

import { bytesToBinary, decodeCharset, utf8 } from "./bytes";
import { mergeParams } from "./headers";
import { transferDecode } from "./parse";
import { classify, clone, finalizeNode, isMessagePart } from "./tree";
import { decodeWords } from "./words";

type SX = null | string | SX[];

const td = new TextDecoder("utf-8");

/** Parse an IMAP s-expression (NIL, atoms, quoted strings, {n} literals, lists). */
export function parseSexp(input: string | Uint8Array): SX {
  const b = typeof input === "string" ? utf8(input) : input;
  let i = 0;
  const ws = () => {
    while (i < b.length && (b[i] === 32 || b[i] === 9 || b[i] === 13 || b[i] === 10)) i++;
  };
  const value = (depth: number): SX => {
    ws();
    if (i >= b.length) return null;
    const c = b[i]!;
    if (c === 40 /* ( */) {
      i++;
      const list: SX[] = [];
      if (depth > 200) throw new Error("too deep");
      for (;;) {
        ws();
        if (i >= b.length) return list;
        if (b[i] === 41 /* ) */) {
          i++;
          return list;
        }
        list.push(value(depth + 1));
      }
    }
    if (c === 34 /* " */) {
      i++;
      const out: number[] = [];
      while (i < b.length && b[i] !== 34) {
        if (b[i] === 92 /* \ */ && i + 1 < b.length) i++;
        out.push(b[i]!);
        i++;
      }
      i++;
      return td.decode(Uint8Array.from(out));
    }
    if (c === 123 /* { */) {
      const close = b.indexOf(125, i);
      const n = parseInt(td.decode(b.subarray(i + 1, close)).replace("+", ""), 10) || 0;
      i = close + 1;
      if (b[i] === 13) i++;
      if (b[i] === 10) i++;
      const s = td.decode(b.subarray(i, i + n));
      i += n;
      return s;
    }
    if (c === 41) {
      i++;
      return null;
    }
    const start = i;
    while (i < b.length && ![32, 9, 13, 10, 40, 41].includes(b[i]!)) i++;
    const atom = td.decode(b.subarray(start, i));
    return atom.toUpperCase() === "NIL" ? null : atom;
  };
  return value(0);
}

const str = (x: SX | undefined): string | undefined => (typeof x === "string" ? x : undefined);
const num = (x: SX | undefined): number | undefined => {
  if (typeof x !== "string") return undefined;
  const n = parseInt(x, 10);
  return Number.isNaN(n) ? undefined : n;
};
const childId = (prefix: string, i: number) => (prefix ? `${prefix}.${i}` : String(i));

function paramsOf(x: SX | undefined): Record<string, string> {
  if (!Array.isArray(x)) return {};
  const pairs: Array<[string, string]> = [];
  for (let k = 0; k + 1 < x.length; k += 2) {
    const key = str(x[k]);
    const v = str(x[k + 1]);
    if (key) pairs.push([key, v ?? ""]);
  }
  return mergeParams(pairs);
}

function dispOf(x: SX | undefined): { type: string; params: Record<string, string> } | undefined {
  if (typeof x === "string") return { type: x.toLowerCase(), params: {} };
  if (!Array.isArray(x)) return undefined;
  const t = str(x[0]);
  if (!t) return undefined;
  return { type: t.toLowerCase(), params: paramsOf(x[1]) };
}

function langOf(x: SX | undefined): string[] | undefined {
  if (typeof x === "string") return [x];
  if (Array.isArray(x)) {
    const l = x.filter((v): v is string => typeof v === "string");
    return l.length ? l : undefined;
  }
  return undefined;
}

/** disposition, language, location starting at x[i]. */
function setExt(node: BodyStructureNode, x: SX[], i: number): void {
  const d = dispOf(x[i]);
  if (d) node.disposition = d;
  const l = langOf(x[i + 1]);
  if (l) node.language = l;
  const loc = str(x[i + 2]);
  if (loc) node.location = loc;
}

function toNode(x: SX[], idMulti: string, idSingle: string, depth: number): BodyStructureNode {
  if (Array.isArray(x[0])) {
    let i = 0;
    const kids: SX[][] = [];
    while (Array.isArray(x[i])) kids.push(x[i++] as SX[]);
    const node: BodyStructureNode = { partId: idMulti, type: "multipart", subtype: (str(x[i++]) ?? "mixed").toLowerCase(), params: {} };
    node.children = kids.map((k, j) => {
      const id = childId(idMulti, j + 1);
      return toNode(k, id, id, depth + 1);
    });
    // multipart extension data: params, disposition, language, location
    node.params = paramsOf(x[i++]);
    setExt(node, x, i);
    return node;
  }
  const node: BodyStructureNode = {
    partId: idSingle,
    type: (str(x[0]) ?? "application").toLowerCase(),
    subtype: (str(x[1]) ?? "octet-stream").toLowerCase(),
    params: paramsOf(x[2]),
  };
  const id = str(x[3]);
  if (id) node.id = id;
  const desc = str(x[4]);
  if (desc) node.description = decodeWords(desc);
  const enc = str(x[5]);
  node.encoding = (enc ?? "7bit").toLowerCase();
  const size = num(x[6]);
  if (size !== undefined) node.size = size;
  let i = 7;
  if (node.type === "text") {
    const lines = num(x[7]);
    if (lines !== undefined) node.lines = lines;
    i = 8;
  } else if (isMessagePart(node) && Array.isArray(x[8])) {
    node.envelope = x[7];
    if (depth < 50) node.childNode = toNode(x[8] as SX[], idSingle, childId(idSingle, 1), depth + 1);
    const lines = num(x[9]);
    if (lines !== undefined) node.lines = lines;
    i = 10;
  }
  // single-part extension data: md5, disposition, language, location
  const md5 = str(x[i]);
  if (md5) node.md5 = md5;
  setExt(node, x, i + 1);
  return node;
}

function classified(n: PartNode): PartNode {
  classify(n);
  return n;
}

function fallback(): PartNode {
  return finalizeNode({ partId: "1", type: "text", subtype: "plain", params: {} });
}

/**
 * Turn an IMAP BODYSTRUCTURE into a {@link PartNode} tree. Accepts the raw
 * response text (a bare `(…)` list, `BODYSTRUCTURE (…)` or a whole
 * `* 1 FETCH (… BODYSTRUCTURE (…))` line, literals allowed) or an already
 * parsed {@link BodyStructureNode} (as returned by @lacspace/imap), which is
 * normalised and enriched. Never throws.
 */
export function parseBodyStructure(input: string | Uint8Array | BodyStructureNode): PartNode {
  try {
    if (typeof input === "object" && !(input instanceof Uint8Array)) return classified(finalizeNode(clone(input)));
    let text = typeof input === "string" ? input : td.decode(input);
    const m = /BODY(?:STRUCTURE)?\s*\(/i.exec(text);
    if (m) text = text.slice(m.index + m[0].length - 1);
    else {
      const p = text.indexOf("(");
      if (p < 0) return fallback();
      text = text.slice(p);
    }
    const sx = parseSexp(text);
    if (!Array.isArray(sx) || !sx.length) return fallback();
    return classified(finalizeNode(toNode(sx, "", "1", 0)));
  } catch {
    return fallback();
  }
}

/**
 * Decode a part fetched by partId: undo its Content-Transfer-Encoding and,
 * for text parts, its charset. Returns a string for text/*, bytes otherwise.
 */
export function decodePart(bytes: Uint8Array | string, node: Pick<BodyStructureNode, "type" | "encoding" | "params"> & { subtype?: string }): Uint8Array | string {
  const bin = typeof bytes === "string" ? (/[^\x00-\xff]/.test(bytes) ? bytesToBinary(utf8(bytes)) : bytes) : bytesToBinary(bytes);
  const decoded = transferDecode(bin, node.encoding);
  if ((node.type ?? "").toLowerCase() === "text") return decodeCharset(decoded, node.params?.charset);
  return decoded;
}
