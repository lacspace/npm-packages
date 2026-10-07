import type { SearchCriteria } from "./types.js";
import { ImapError } from "./errors.js";

const enc = new TextEncoder();
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A literal argument inside a command. */
export type CommandArg = string | Uint8Array;

/** Quoted string when safe 7-bit text, otherwise a literal (UTF-8 bytes). */
export function encodeString(s: string): CommandArg {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(s) && s.length < 1000) {
    return '"' + s.replace(/[\\"]/g, (m) => "\\" + m) + '"';
  }
  return enc.encode(s);
}

export function isAscii(s: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7f]*$/.test(s);
}

/** d-Mon-yyyy (RFC 3501 date), using the UTC calendar date. */
export function formatSearchDate(d: Date): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) throw new ImapError("Invalid date in search criteria", "EINVAL");
  return `${d.getUTCDate()}-${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

/** "dd-Mon-yyyy hh:mm:ss +0000" for APPEND (UTC). */
export function formatInternalDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}-${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(
    d.getUTCSeconds(),
  )} +0000`;
}

/** Parse INTERNALDATE "17-Jul-1996 02:44:25 -0700". */
export function parseInternalDate(s: string): Date | undefined {
  const m = /^\s*(\d{1,2})-([A-Za-z]{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})\s*$/.exec(s);
  if (!m) {
    const t = Date.parse(s);
    return Number.isNaN(t) ? undefined : new Date(t);
  }
  const mon = MONTHS.findIndex((x) => x.toLowerCase() === m[2]!.toLowerCase());
  if (mon < 0) return undefined;
  const offset = (Number(m[8]) * 60 + Number(m[9])) * (m[7] === "-" ? -1 : 1);
  const utc = Date.UTC(Number(m[3]), mon, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6]));
  return new Date(utc - offset * 60000);
}

/** Compact sequence-set: [1,2,3,4,5,9,12,13] → "1:5,9,12:13". Accepts any order, dedupes. */
export function uidRange(list: Iterable<number>): string {
  const nums = [...new Set([...list].filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
  if (!nums.length) return "";
  const out: string[] = [];
  let start = nums[0]!;
  let prev = start;
  for (let i = 1; i <= nums.length; i++) {
    const n = nums[i];
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    out.push(start === prev ? String(start) : `${start}:${prev}`);
    if (n !== undefined) start = prev = n;
  }
  return out.join(",");
}

/** Newest-first copy (UIDs grow with arrival time). */
export function sortUidsDesc(uids: Iterable<number>): number[] {
  return [...uids].sort((a, b) => b - a);
}

/** Expand "1:3,7" → [1,2,3,7]. `*` and ranges over `limit` entries are rejected. */
export function expandSequenceSet(set: string, limit = 1_000_000): number[] {
  const out: number[] = [];
  for (const part of set.split(",")) {
    if (!part) continue;
    const [a, b] = part.split(":");
    const x = Number(a);
    if (!Number.isInteger(x)) continue;
    if (b === undefined) {
      out.push(x);
      continue;
    }
    const y = Number(b);
    if (!Number.isInteger(y)) continue;
    const lo = Math.min(x, y);
    const hi = Math.max(x, y);
    if (out.length + (hi - lo) > limit) break;
    for (let i = lo; i <= hi; i++) out.push(i);
  }
  return out;
}

/** Normalise a fetch/store range argument into a sequence-set string. */
export function toSequenceSet(range: string | number | number[]): string {
  if (typeof range === "number") range = String(range);
  const s = Array.isArray(range) ? uidRange(range) : range.trim();
  if (!s || !/^[0-9*:,]+$/.test(s)) throw new ImapError(`Invalid sequence set ${JSON.stringify(s)}`, "EINVAL");
  return s;
}

/** Flags/keywords: one atom each, `\Seen` style or a plain keyword. */
export function checkFlag(f: string): string {
  // eslint-disable-next-line no-control-regex
  if (!/^\\?[^\x00-\x20()"{\]%*\\\x7f]+$/.test(f) && f !== "\\*") throw new ImapError(`Invalid flag ${JSON.stringify(f)}`, "EINVAL");
  return f;
}

export function flagList(flags: string[]): string {
  return "(" + flags.map(checkFlag).join(" ") + ")";
}

export interface BuiltSearch {
  /** Search keys; strings are already-encoded atoms/quoted strings, Uint8Array = literal. */
  args: CommandArg[];
  /** "UTF-8" when any argument is non-ASCII (send `CHARSET UTF-8`). */
  charset: "UTF-8" | null;
}

/** Turn a criteria object into IMAP SEARCH keys. Empty criteria → ALL. */
export function buildSearch(criteria: SearchCriteria = {}): BuiltSearch {
  const state = { charset: null as "UTF-8" | null };
  const args = searchKeys(criteria, state);
  if (!args.length) args.push("ALL");
  return { args, charset: state.charset };
}

function searchKeys(c: SearchCriteria, state: { charset: "UTF-8" | null }): CommandArg[] {
  const out: CommandArg[] = [];
  const str = (s: string) => {
    if (!isAscii(s)) state.charset = "UTF-8";
    out.push(encodeString(String(s)));
  };
  const flag = (v: boolean | undefined, yes: string, no: string) => {
    if (v === true) out.push(yes);
    else if (v === false) out.push(no);
  };
  if (c.all) out.push("ALL");
  flag(c.seen, "SEEN", "UNSEEN");
  flag(c.unseen, "UNSEEN", "SEEN");
  flag(c.flagged, "FLAGGED", "UNFLAGGED");
  flag(c.unflagged, "UNFLAGGED", "FLAGGED");
  flag(c.answered, "ANSWERED", "UNANSWERED");
  flag(c.deleted, "DELETED", "UNDELETED");
  flag(c.draft, "DRAFT", "UNDRAFT");
  if (c.since) out.push("SINCE", formatSearchDate(c.since));
  if (c.before) out.push("BEFORE", formatSearchDate(c.before));
  if (c.on) out.push("ON", formatSearchDate(c.on));
  if (c.sentSince) out.push("SENTSINCE", formatSearchDate(c.sentSince));
  if (c.sentBefore) out.push("SENTBEFORE", formatSearchDate(c.sentBefore));
  if (c.sentOn) out.push("SENTON", formatSearchDate(c.sentOn));
  for (const k of ["from", "to", "cc", "bcc", "subject", "body", "text"] as const) {
    const v = c[k];
    if (v !== undefined && v !== null) {
      out.push(k.toUpperCase());
      str(v);
    }
  }
  for (const [name, value] of c.header ?? []) {
    if (!/^[\x21-\x39\x3b-\x7e]+$/.test(name)) throw new ImapError(`Invalid header name ${JSON.stringify(name)}`, "EINVAL");
    out.push("HEADER", name);
    str(value);
  }
  if (c.uid !== undefined) out.push("UID", toSequenceSet(c.uid));
  if (c.larger !== undefined) out.push("LARGER", String(Math.floor(c.larger)));
  if (c.smaller !== undefined) out.push("SMALLER", String(Math.floor(c.smaller)));
  if (c.keyword) out.push("KEYWORD", checkFlag(c.keyword));
  if (c.unkeyword) out.push("UNKEYWORD", checkFlag(c.unkeyword));
  if (c.modseq !== undefined) out.push("MODSEQ", BigInt(c.modseq).toString());
  if (c.or) {
    out.push("OR", ...group(searchKeys(c.or[0], state)), ...group(searchKeys(c.or[1], state)));
  }
  if (c.not) out.push("NOT", ...group(searchKeys(c.not, state)));
  return out;
}

function group(keys: CommandArg[]): CommandArg[] {
  if (!keys.length) return ["ALL"];
  if (keys.length === 1) return keys;
  return ["(", ...keys, ")"];
}

/**
 * Join arguments with single spaces, except right after "(" and right before ")".
 * Strings are emitted verbatim; Uint8Array items stay separate (they become literals).
 */
export function joinArgs(args: CommandArg[]): CommandArg[] {
  const out: CommandArg[] = [];
  let prev: CommandArg | undefined;
  for (const a of args) {
    const needSpace = prev !== undefined && prev !== "(" && a !== ")";
    if (typeof a === "string") {
      const piece = (needSpace ? " " : "") + a;
      const last = out[out.length - 1];
      if (typeof last === "string") out[out.length - 1] = last + piece;
      else out.push(piece);
    } else {
      if (needSpace) {
        const last = out[out.length - 1];
        if (typeof last === "string") out[out.length - 1] = last + " ";
        else out.push(" ");
      }
      out.push(a);
    }
    prev = a;
  }
  return out;
}
