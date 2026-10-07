/**
 * Byte-accurate IMAP response framing + tokenizing.
 *
 * `ResponseFramer` turns a stream of arbitrary TCP chunks into complete responses
 * (a response = one line plus any `{n}` / `{n+}` / `~{n}` literals and their
 * continuation lines). It never decodes to a string before literal lengths are known.
 *
 * `parseImapResponse` tokenizes one complete response.
 */
import { ImapProtocolError } from "./errors.js";

export interface ImapAtom {
  type: "atom";
  value: string;
}
export interface ImapQuoted {
  type: "string";
  value: string;
}
export interface ImapLiteral {
  type: "literal";
  value: Uint8Array;
}
export interface ImapList {
  type: "list";
  value: ImapToken[];
}
/** `null` is NIL. */
export type ImapToken = ImapAtom | ImapQuoted | ImapLiteral | ImapList | null;

export interface ImapResponseCode {
  /** Uppercase, e.g. UIDVALIDITY, TRYCREATE, COPYUID. */
  name: string;
  args: ImapToken[];
}

export interface ImapResponse {
  /** "*" untagged, "+" continuation, or the command tag. */
  tag: string;
  /** Uppercase: OK NO BAD BYE PREAUTH FETCH EXISTS LIST CAPABILITY … ("+" for continuations). */
  type: string;
  /** Leading number of `* 5 EXISTS` / `* 3 FETCH (...)`. */
  number?: number;
  code?: ImapResponseCode;
  /** Human-readable text of status responses and continuations. */
  text?: string;
  attributes: ImapToken[];
}

const utf8 = new TextDecoder("utf-8");
const STATUS = new Set(["OK", "NO", "BAD", "BYE", "PREAUTH"]);

const SP = 0x20;
const CR = 0x0d;
const LF = 0x0a;
const LPAREN = 0x28;
const RPAREN = 0x29;
const DQUOTE = 0x22;
const LBRACE = 0x7b;
const RBRACE = 0x7d;
const LBRACKET = 0x5b;
const RBRACKET = 0x5d;
const TILDE = 0x7e;
const BACKSLASH = 0x5c;
const PLUS = 0x2b;

/** If the line (ending in LF) ends with `{n}`, `{n+}`, `{n-}` or `~{n}`, return n. */
export function literalAtEnd(line: Uint8Array): number {
  let end = line.length - 1;
  if (end < 0 || line[end] !== LF) return -1;
  end--;
  if (end >= 0 && line[end] === CR) end--;
  if (end < 0 || line[end] !== RBRACE) return -1;
  let i = end - 1;
  if (i >= 0 && (line[i] === PLUS || line[i] === 0x2d)) i--;
  const digitsEnd = i;
  while (i >= 0 && line[i]! >= 0x30 && line[i]! <= 0x39) i--;
  if (i === digitsEnd || i < 0 || line[i] !== LBRACE) return -1;
  if (digitsEnd - i > 15) return -1;
  let n = 0;
  for (let j = i + 1; j <= digitsEnd; j++) n = n * 10 + (line[j]! - 0x30);
  return n;
}

export class ResponseFramer {
  private parts: Uint8Array[] = [];
  private line: Uint8Array[] = [];
  private literalLeft = 0;
  private literalChunks: Uint8Array[] = [];
  /** Max bytes in a single line (not counting literals) before we give up. */
  maxLineBytes = 1024 * 1024;
  private lineBytes = 0;

  constructor(private readonly onResponse: (raw: Buffer) => void) {}

  get idle(): boolean {
    return this.parts.length === 0 && this.line.length === 0 && this.literalLeft === 0;
  }

  push(chunk: Uint8Array): void {
    let off = 0;
    while (off < chunk.length) {
      if (this.literalLeft > 0) {
        const take = Math.min(this.literalLeft, chunk.length - off);
        this.literalChunks.push(chunk.subarray(off, off + take));
        off += take;
        this.literalLeft -= take;
        if (this.literalLeft === 0) {
          this.parts.push(...this.literalChunks);
          this.literalChunks = [];
        }
        continue;
      }
      const nl = chunk.indexOf(LF, off);
      if (nl === -1) {
        const rest = chunk.subarray(off);
        this.line.push(rest);
        this.lineBytes += rest.length;
        if (this.lineBytes > this.maxLineBytes) {
          throw new ImapProtocolError("Response line too long", utf8.decode(rest.subarray(0, 200)));
        }
        return;
      }
      this.line.push(chunk.subarray(off, nl + 1));
      off = nl + 1;
      const lineBuf = this.line.length === 1 ? this.line[0]! : Buffer.concat(this.line);
      this.line = [];
      this.lineBytes = 0;
      this.parts.push(lineBuf);
      const n = literalAtEnd(lineBuf);
      if (n > 0) {
        this.literalLeft = n;
      } else if (n === 0) {
        // {0} literal: nothing to read, continue with the rest of the response
      } else {
        const all = this.parts.length === 1 ? Buffer.from(this.parts[0]!) : Buffer.concat(this.parts);
        this.parts = [];
        this.onResponse(all);
      }
    }
  }
}

class Tokenizer {
  pos = 0;
  constructor(readonly buf: Uint8Array) {}

  get eol(): boolean {
    const c = this.buf[this.pos];
    return c === undefined || c === CR || c === LF;
  }

  skipSpaces(): void {
    while (this.buf[this.pos] === SP) this.pos++;
  }

  restText(): string {
    const start = this.pos;
    let end = this.buf.indexOf(LF, start);
    if (end === -1) end = this.buf.length;
    let e = end;
    if (e > start && this.buf[e - 1] === CR) e--;
    this.pos = end;
    return utf8.decode(this.buf.subarray(start, e));
  }

  /** Atom-ish run; `[...]` sections may contain spaces/parens (BODY[HEADER.FIELDS (A B)]). */
  readAtomRaw(inCode = false): string {
    const start = this.pos;
    let depth = 0;
    for (;;) {
      const c = this.buf[this.pos];
      if (c === undefined || c === CR || c === LF) break;
      if (depth > 0) {
        if (c === RBRACKET) depth--;
        else if (c === LBRACKET) depth++;
        this.pos++;
        continue;
      }
      if (c === SP || c === LPAREN || c === RPAREN || c === DQUOTE) break;
      if (c === RBRACKET && inCode) break;
      if (c === LBRACKET) depth++;
      this.pos++;
    }
    return utf8.decode(this.buf.subarray(start, this.pos));
  }

  readQuoted(): string {
    this.pos++; // opening quote
    const bytes: number[] = [];
    let start = this.pos;
    let simple = true;
    for (;;) {
      const c = this.buf[this.pos];
      if (c === undefined || c === LF) {
        // unterminated: be lenient
        break;
      }
      if (c === BACKSLASH) {
        if (simple) {
          for (let j = start; j < this.pos; j++) bytes.push(this.buf[j]!);
          simple = false;
        }
        const n = this.buf[this.pos + 1];
        if (n !== undefined) bytes.push(n);
        this.pos += 2;
        continue;
      }
      if (c === DQUOTE) {
        const end = this.pos;
        this.pos++;
        if (simple) return utf8.decode(this.buf.subarray(start, end));
        return utf8.decode(Uint8Array.from(bytes));
      }
      if (!simple) bytes.push(c);
      this.pos++;
    }
    if (simple) return utf8.decode(this.buf.subarray(start, this.pos));
    return utf8.decode(Uint8Array.from(bytes));
  }

  readLiteral(): Uint8Array {
    if (this.buf[this.pos] === TILDE) this.pos++;
    this.pos++; // {
    let n = 0;
    let digits = 0;
    while (this.buf[this.pos]! >= 0x30 && this.buf[this.pos]! <= 0x39) {
      n = n * 10 + (this.buf[this.pos]! - 0x30);
      this.pos++;
      digits++;
    }
    if (this.buf[this.pos] === PLUS || this.buf[this.pos] === 0x2d) this.pos++;
    if (!digits || this.buf[this.pos] !== RBRACE) throw this.error("Bad literal header");
    this.pos++;
    if (this.buf[this.pos] === CR) this.pos++;
    if (this.buf[this.pos] !== LF) throw this.error("Literal header not followed by CRLF");
    this.pos++;
    if (this.pos + n > this.buf.length) throw this.error("Literal shorter than announced");
    const v = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return v;
  }

  readList(inCode: boolean): ImapList {
    this.pos++; // (
    const value: ImapToken[] = [];
    for (;;) {
      this.skipSpaces();
      const c = this.buf[this.pos];
      if (c === RPAREN) {
        this.pos++;
        return { type: "list", value };
      }
      if (c === undefined || c === CR || c === LF) return { type: "list", value }; // lenient
      if (inCode && c === RBRACKET) return { type: "list", value };
      value.push(this.readToken(inCode));
    }
  }

  readToken(inCode = false): ImapToken {
    this.skipSpaces();
    const c = this.buf[this.pos];
    if (c === LPAREN) return this.readList(inCode);
    if (c === DQUOTE) return { type: "string", value: this.readQuoted() };
    if (c === LBRACE || (c === TILDE && this.buf[this.pos + 1] === LBRACE)) {
      return { type: "literal", value: this.readLiteral() };
    }
    const a = this.readAtomRaw(inCode);
    if (a === "") {
      // stray ")" or similar — skip a byte so we always make progress
      this.pos++;
      throw this.error(`Unexpected character ${JSON.stringify(String.fromCharCode(c ?? 0))}`);
    }
    if (a.length === 3 && a.toUpperCase() === "NIL") return null;
    return { type: "atom", value: a };
  }

  readTokensToEol(): ImapToken[] {
    const out: ImapToken[] = [];
    for (;;) {
      this.skipSpaces();
      if (this.eol) return out;
      out.push(this.readToken());
    }
  }

  error(msg: string): ImapProtocolError {
    const end = this.buf.indexOf(LF);
    return new ImapProtocolError(msg, utf8.decode(this.buf.subarray(0, Math.min(end === -1 ? this.buf.length : end, 300))));
  }
}

/** Tokenize one complete IMAP response (as produced by `ResponseFramer`, or a plain string). */
export function parseImapResponse(input: Uint8Array | string): ImapResponse {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  const t = new Tokenizer(buf);
  const tag = t.readAtomRaw();
  if (!tag) throw t.error("Empty response");
  if (tag === "+") {
    if (t.buf[t.pos] === SP) t.pos++;
    return { tag, type: "+", text: t.restText(), attributes: [] };
  }
  t.skipSpaces();
  let type: string;
  let number: number | undefined;
  if (tag === "*") {
    const first = t.readAtomRaw();
    if (/^\d+$/.test(first)) {
      number = Number(first);
      t.skipSpaces();
      type = t.readAtomRaw().toUpperCase();
    } else {
      type = first.toUpperCase();
    }
  } else {
    type = t.readAtomRaw().toUpperCase();
  }
  const res: ImapResponse = { tag, type, attributes: [] };
  if (number !== undefined) res.number = number;
  if (STATUS.has(type)) {
    t.skipSpaces();
    if (t.buf[t.pos] === LBRACKET) {
      t.pos++;
      const name = t.readAtomRaw(true).toUpperCase();
      const args: ImapToken[] = [];
      for (;;) {
        t.skipSpaces();
        const c = t.buf[t.pos];
        if (c === RBRACKET) {
          t.pos++;
          break;
        }
        if (c === undefined || c === CR || c === LF) break;
        try {
          args.push(t.readToken(true));
        } catch {
          // unparseable code argument (seen with odd Exchange ALERTs): skip to "]"
          while (!t.eol && t.buf[t.pos] !== RBRACKET) t.pos++;
        }
      }
      res.code = { name, args };
    }
    t.skipSpaces();
    res.text = t.restText();
  } else {
    res.attributes = t.readTokensToEol();
  }
  return res;
}

// ---- token helpers --------------------------------------------------------

export function tokString(t: ImapToken | undefined): string | null {
  if (!t) return null;
  if (t.type === "atom" || t.type === "string") return t.value;
  if (t.type === "literal") return utf8.decode(t.value);
  return null;
}

export function tokNumber(t: ImapToken | undefined): number | undefined {
  const s = tokString(t);
  if (s === null || s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function tokBigInt(t: ImapToken | undefined): bigint | undefined {
  const s = tokString(t);
  if (s === null || !/^\d+$/.test(s)) return undefined;
  return BigInt(s);
}

export function tokList(t: ImapToken | undefined): ImapToken[] | null {
  return t && t.type === "list" ? t.value : null;
}

export function tokBytes(t: ImapToken | undefined): Uint8Array {
  if (!t) return new Uint8Array(0);
  if (t.type === "literal") return t.value;
  if (t.type === "atom" || t.type === "string") return new TextEncoder().encode(t.value);
  return new Uint8Array(0);
}

/** First line of a raw response, for logs/errors (never includes literal bodies). */
export function firstLine(raw: Uint8Array, max = 300): string {
  let end = raw.indexOf(LF);
  if (end === -1) end = raw.length;
  let e = end;
  if (e > 0 && raw[e - 1] === CR) e--;
  const s = utf8.decode(raw.subarray(0, Math.min(e, max)));
  return e > max ? s + "…" : s;
}
