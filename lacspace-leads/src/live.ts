/**
 * Live output: write each finished lead to the output file the moment it is found, so the
 * file grows row by row while the search runs and a Ctrl-C, crash or CAPTCHA never costs
 * what was already collected. @since 1.8.0
 *
 *   csv     header first, then one appended line per lead
 *   ndjson  one appended line per lead
 *   json    always a valid JSON array: the closing "]" is rewritten in place after each lead
 *   xlsx    the workbook is rewritten atomically (temp file + rename) after each lead
 *
 * `finish(leads)` rewrites the file once more with the final, sorted list.
 */
import { appendFileSync, closeSync, existsSync, fstatSync, openSync, renameSync, writeFileSync, writeSync } from "node:fs";
import { stringify as csvStringify } from "@lacspace/csv";
import { dedupeKey } from "./filter.js";
import { serialize, toRows } from "./export.js";
import type { Lead, LeadField, OutputFormat, SearchOptions } from "./types.js";

export interface LiveWriterOptions {
  /** Output path, or "-" to stream to stdout (csv / ndjson only). */
  file: string;
  format: OutputFormat;
  fields: LeadField[];
  sheetName?: string;
  /** Skip a lead whose identity is already in the file. Default "smart". */
  dedupe?: SearchOptions["dedupe"];
  /** Rows already in the file (append / resume). Written first, and count toward `count`. */
  seed?: Lead[];
  /** Write to stdout instead of a file. */
  stdout?: { write(chunk: string): unknown };
  /** Called once if the file can't be written (e.g. open in Excel). Rows stay in memory and are retried. */
  onWriteError?: (err: Error) => void;
}

export interface LiveWriter {
  /** Add a finished lead; false if it was a duplicate of a row already written. */
  add(lead: Lead): boolean;
  /** Rows in the file (seed + added). */
  readonly count: number;
  /** Rows added by this run. */
  readonly added: number;
  /** Every row in the file, in write order. */
  readonly leads: readonly Lead[];
  /** Make sure everything added is on disk. */
  flush(): void;
  /** Replace the file with the final list (sorted, merged…) and close. */
  finish(final?: Lead[]): void;
}

const pick = (lead: Lead, fields: LeadField[]): Record<string, unknown> => {
  const o: Record<string, unknown> = {};
  for (const f of fields) if (lead[f] !== undefined) o[f] = lead[f];
  return o;
};

/** Write leads to a file as they arrive. */
export function createLiveWriter(opts: LiveWriterOptions): LiveWriter {
  const { file, format, fields } = opts;
  const by = opts.dedupe ?? "smart";
  const toStdout = file === "-" || !!opts.stdout;
  const out = opts.stdout ?? { write: (c: string) => process.stdout.write(c) };
  if (toStdout && (format === "json" || format === "xlsx")) throw new Error(`live output to stdout needs csv or ndjson, not ${format}`);
  const rows: Lead[] = [];
  const keys = new Set<string>();
  let added = 0;
  let failed = false;
  let dirty = false;
  let jsonFd: number | undefined;

  const warn = (err: unknown): void => {
    if (!failed) opts.onWriteError?.(err as Error);
    failed = true;
    dirty = true;
  };
  const atomic = (data: string | Uint8Array): void => {
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, data);
    renameSync(tmp, file);
  };
  const csvLine = (lead: Lead): string => csvStringify(toRows([lead], fields) as unknown as Record<string, string>[], { header: false, escapeFormulas: true });
  const csvHeader = (): string => csvStringify([toRows([{}], fields)[0]!] as unknown as Record<string, string>[], { escapeFormulas: true }).split(/\r?\n/)[0]! + "\n";
  const nl = (s: string): string => (s.endsWith("\n") ? s : s + "\n");

  // Rewrite the whole file from `rows` (start, recovery, xlsx, finish).
  const rewrite = (list: readonly Lead[]): void => {
    const { data, binary } = serialize([...list], format, fields, opts.sheetName ? { sheetName: opts.sheetName } : {});
    if (format === "csv" && !list.length) atomic(csvHeader());
    else atomic(binary ? Buffer.from(data as Uint8Array) : format === "json" ? (data as string) : nl(data as string));
  };

  // JSON: keep "[\n …\n]" valid by overwriting the trailing "\n]" in place.
  const jsonAppend = (lead: Lead): void => {
    jsonFd ??= openSync(file, "r+");
    const size = fstatSync(jsonFd).size;
    const body = JSON.stringify(pick(lead, fields), null, 2).replace(/^/gm, "  ");
    const chunk = (rows.length === 1 ? "\n" : ",\n") + body + "\n]";
    writeSync(jsonFd, chunk, Math.max(1, size - (rows.length === 1 ? 1 : 2)));
  };

  const start = (): void => {
    for (const l of opts.seed ?? []) {
      const k = dedupeKey(l, by);
      if (k !== undefined) keys.add(k);
      rows.push(l);
    }
    if (toStdout) {
      if (format === "csv") out.write(csvHeader());
      return;
    }
    try {
      if (format === "json" && !rows.length) atomic("[]");
      else rewrite(rows);
    } catch (e) { warn(e); }
  };

  const write = (lead: Lead): void => {
    if (toStdout) {
      out.write(format === "csv" ? nl(csvLine(lead)) : JSON.stringify(pick(lead, fields)) + "\n");
      return;
    }
    if (dirty) {
      // A previous write failed (file locked?): try to bring the whole file up to date.
      try {
        if (jsonFd !== undefined) { closeSync(jsonFd); jsonFd = undefined; }
        rewrite(rows);
        dirty = false;
      } catch (e) { warn(e); }
      return;
    }
    try {
      if (format === "csv") appendFileSync(file, nl(csvLine(lead)));
      else if (format === "ndjson") appendFileSync(file, JSON.stringify(pick(lead, fields)) + "\n");
      else if (format === "json") {
        if (rows.length > 1 && !existsSync(file)) throw new Error("output file disappeared");
        jsonAppend(lead);
      } else rewrite(rows);
    } catch (e) { warn(e); }
  };

  start();

  return {
    add(lead) {
      const k = dedupeKey(lead, by);
      if (k !== undefined) {
        if (keys.has(k)) return false;
        keys.add(k);
      }
      rows.push(lead);
      added++;
      write(lead);
      return true;
    },
    get count() { return rows.length; },
    get added() { return added; },
    get leads() { return rows; },
    flush() {
      if (toStdout || !dirty) return;
      try {
        if (jsonFd !== undefined) { closeSync(jsonFd); jsonFd = undefined; }
        rewrite(rows);
        dirty = false;
      } catch (e) { warn(e); }
    },
    finish(final) {
      if (jsonFd !== undefined) { try { closeSync(jsonFd); } catch { /* already closed */ } jsonFd = undefined; }
      if (toStdout) return;
      try { rewrite(final ?? rows); dirty = false; } catch (e) { warn(e); }
    },
  };
}
