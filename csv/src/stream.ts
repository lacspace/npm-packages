/**
 * @lacspace/csv — dialects, chunked/streaming parsing & strict errors
 *
 * A configurable, chunk-safe RFC 4180 tokenizer that the one-shot {@link parse}
 * can't express: custom quote/escape chars, comment lines, BOM strip, strict vs
 * relaxed ragged-row handling, and an incremental parser you feed partial
 * strings (or an async iterable) without buffering the whole input.
 *
 * All new API — the original `parse`/`stringify`/`parseAuto` are untouched.
 */

import type { Row } from "./index";

/** Thrown by strict-mode parsing on malformed input. Carries 1-based row/column. */
export class CsvError extends Error {
  readonly row: number;
  readonly column: number;
  constructor(message: string, row: number, column: number) {
    super(message);
    this.name = "CsvError";
    this.row = row;
    this.column = column;
  }
}

export interface DialectOptions {
  /** Field delimiter. Default ",". */
  delimiter?: string;
  /** Quote character. Default '"'. */
  quote?: string;
  /**
   * Escape character for a quote inside a quoted field. Default = the quote
   * char (RFC 4180 doubling, `""`). Set e.g. `"\\"` for backslash escaping.
   */
  escape?: string;
  /** Lines whose first character is this (outside quotes) are skipped entirely. */
  comment?: string;
  /** Treat the first record as headers → objects. Default true. */
  header?: boolean;
  /** Drop rows that are entirely empty. Default true. */
  skipEmpty?: boolean;
  /** Trim whitespace around unquoted fields. Default false. */
  trim?: boolean;
  /** Strip a leading UTF-8 BOM. Default true (this is a fresh API). */
  bom?: boolean;
  /** Throw {@link CsvError} on ragged rows / unterminated quotes. Default false. */
  strict?: boolean;
  /** Pad/truncate ragged rows to the header width. Default false. */
  relaxed?: boolean;
}

/**
 * Incremental, chunk-safe CSV parser. Feed strings via {@link write} (any
 * boundaries — mid-field, mid-quote, mid-CRLF are all handled) and receive the
 * records completed so far; call {@link end} to flush the final record.
 */
export class CsvStreamParser {
  private readonly delimiter: string;
  private readonly quote: string;
  private readonly escape: string;
  private readonly comment: string | undefined;
  private readonly header: boolean;
  private readonly skipEmpty: boolean;
  private readonly trim: boolean;
  private readonly bom: boolean;
  private readonly strict: boolean;
  private readonly relaxed: boolean;

  private field = "";
  private record: string[] = [];
  private inQuotes = false;
  private fieldWasQuoted = false;
  private started = false;
  private lineStart = true;
  private inComment = false;
  private skipLF = false;
  private pendingQuote = false;
  private pendingEscape = false;
  private firstChunk = true;

  private headers: string[] | undefined;
  private width = -1;
  private rowIndex = 0;
  private out: (Row | string[])[] = [];

  constructor(opts: DialectOptions = {}) {
    this.delimiter = opts.delimiter ?? ",";
    this.quote = opts.quote ?? '"';
    this.escape = opts.escape ?? this.quote;
    this.comment = opts.comment;
    this.header = opts.header ?? true;
    this.skipEmpty = opts.skipEmpty ?? true;
    this.trim = opts.trim ?? false;
    this.bom = opts.bom ?? true;
    this.strict = opts.strict ?? false;
    this.relaxed = opts.relaxed ?? false;
  }

  /** Feed a chunk; returns records completed during this call. */
  write(chunk: string): (Row | string[])[] {
    this.out = [];
    let text = chunk;
    if (this.firstChunk) {
      this.firstChunk = false;
      if (this.bom && text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    }
    for (let i = 0; i < text.length; i++) this.processChar(text[i]!);
    return this.out;
  }

  /** Flush the final record (call once after the last {@link write}). */
  end(): (Row | string[])[] {
    this.out = [];
    if (this.pendingQuote) {
      this.pendingQuote = false;
      this.inQuotes = false;
    }
    if (this.inQuotes && this.strict) {
      throw new CsvError("Unterminated quoted field", this.rowIndex + 1, this.field.length);
    }
    if (this.started || this.field !== "" || this.record.length) this.endRecord();
    return this.out;
  }

  private pushField(): void {
    this.record.push(
      this.trim && !this.fieldWasQuoted ? this.field.trim() : this.field,
    );
    this.field = "";
    this.fieldWasQuoted = false;
  }

  private endRecord(): void {
    this.pushField();
    const rec = this.record;
    this.record = [];
    this.started = false;
    this.lineStart = true;
    if (this.skipEmpty && rec.length === 1 && rec[0] === "") return;
    this.emit(rec);
  }

  private emit(rec: string[]): void {
    this.rowIndex++;
    if (this.header && !this.headers) {
      this.headers = rec;
      return;
    }
    if (this.header) {
      const h = this.headers!;
      let r = rec;
      if (rec.length !== h.length) {
        if (this.strict) {
          throw new CsvError(
            `Row ${this.rowIndex} has ${rec.length} field(s); expected ${h.length}`,
            this.rowIndex,
            Math.min(rec.length, h.length),
          );
        }
        if (this.relaxed) r = h.map((_, i) => rec[i] ?? "");
      }
      const obj: Row = {};
      h.forEach((k, i) => {
        obj[k] = r[i] ?? "";
      });
      this.out.push(obj);
    } else {
      if (this.strict) {
        if (this.width === -1) this.width = rec.length;
        else if (rec.length !== this.width) {
          throw new CsvError(
            `Row ${this.rowIndex} has ${rec.length} field(s); expected ${this.width}`,
            this.rowIndex,
            Math.min(rec.length, this.width),
          );
        }
      }
      this.out.push(rec);
    }
  }

  private processChar(c: string): void {
    if (this.skipLF) {
      this.skipLF = false;
      if (c === "\n") return;
    }
    if (this.pendingQuote) {
      this.pendingQuote = false;
      if (c === this.quote) {
        this.field += this.quote;
        return;
      }
      this.inQuotes = false;
      // fall through: handle c as a normal char outside quotes
    } else if (this.pendingEscape) {
      this.pendingEscape = false;
      this.field += c;
      return;
    } else if (this.inQuotes) {
      if (this.escape !== this.quote && c === this.escape) {
        this.pendingEscape = true;
        return;
      }
      if (c === this.quote) {
        this.pendingQuote = true;
        return;
      }
      this.field += c;
      return;
    }

    // outside quotes
    if (this.inComment) {
      if (c === "\n") this.inComment = false;
      else if (c === "\r") {
        this.skipLF = true;
        this.inComment = false;
      }
      return;
    }
    if (this.lineStart && this.comment !== undefined && c === this.comment) {
      this.inComment = true;
      return;
    }
    if (c === this.quote) {
      this.inQuotes = true;
      this.fieldWasQuoted = true;
      this.started = true;
      this.lineStart = false;
      return;
    }
    if (c === this.delimiter) {
      this.pushField();
      this.started = true;
      this.lineStart = false;
      return;
    }
    if (c === "\r") {
      this.skipLF = true;
      this.endRecord();
      return;
    }
    if (c === "\n") {
      this.endRecord();
      return;
    }
    this.field += c;
    this.started = true;
    this.lineStart = false;
  }
}

export interface ParseDialectOptions extends DialectOptions {}

/**
 * One-shot parse with full dialect control (custom quote/escape, comments,
 * strict/relaxed, BOM). Like {@link parse}, `header:false` yields `string[][]`.
 */
export function parseDialect(
  text: string,
  opts: { header: false } & DialectOptions,
): string[][];
export function parseDialect<T = Row>(
  text: string,
  opts?: { header?: true } & DialectOptions,
): T[];
export function parseDialect(text: string, opts: DialectOptions = {}): unknown {
  const p = new CsvStreamParser(opts);
  const out = [...p.write(text), ...p.end()];
  return out;
}

/**
 * Parse an array/iterable of chunks and return all rows — identical output to
 * calling {@link parse}/{@link parseDialect} on the concatenated string.
 */
export function parseChunks(
  chunks: Iterable<string>,
  opts: { header: false } & DialectOptions,
): string[][];
export function parseChunks<T = Row>(
  chunks: Iterable<string>,
  opts?: { header?: true } & DialectOptions,
): T[];
export function parseChunks(chunks: Iterable<string>, opts: DialectOptions = {}): unknown {
  const p = new CsvStreamParser(opts);
  const out: (Row | string[])[] = [];
  for (const c of chunks) out.push(...p.write(c));
  out.push(...p.end());
  return out;
}

/**
 * Async-iterate rows from a (sync or async) iterable of string chunks, without
 * buffering the whole input — ideal for large files / network streams.
 *
 * @example for await (const row of parseStream(res.body)) { ... }
 */
export async function* parseStream<T = Row>(
  source: Iterable<string> | AsyncIterable<string>,
  opts: DialectOptions = {},
): AsyncGenerator<T> {
  const p = new CsvStreamParser(opts);
  for await (const chunk of source as AsyncIterable<string>) {
    for (const rec of p.write(chunk)) yield rec as T;
  }
  for (const rec of p.end()) yield rec as T;
}
