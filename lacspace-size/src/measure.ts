/**
 * Byte-size measurement: raw, gzip and brotli, using only `node:zlib`.
 */
import { readFileSync } from "node:fs";
import { gzipSync, brotliCompressSync, constants as zc } from "node:zlib";

export interface MeasureOptions {
  /** Compute gzip size. Default true. */
  gzip?: boolean;
  /** Compute brotli size (slower). Default true. */
  brotli?: boolean;
  /** zlib gzip level 0-9. Default 9 (max, matches most CDN configs). */
  gzipLevel?: number;
  /** brotli quality 0-11. Default 11 (max). */
  brotliQuality?: number;
}

/** The three size metrics for one buffer or file. */
export interface Sizes {
  /** Uncompressed byte length. */
  raw: number;
  /** gzip-compressed byte length (0 if not computed). */
  gzip: number;
  /** brotli-compressed byte length (0 if not computed). */
  brotli: number;
}

/** Measure raw/gzip/brotli sizes of an in-memory buffer. */
export function measureBuffer(buf: Uint8Array, opts: MeasureOptions = {}): Sizes {
  const wantGzip = opts.gzip ?? true;
  const wantBrotli = opts.brotli ?? true;
  const level = clamp(opts.gzipLevel ?? 9, 0, 9);
  const quality = clamp(opts.brotliQuality ?? 11, 0, 11);
  const raw = buf.byteLength;
  const gzip = wantGzip ? gzipSync(buf, { level }).byteLength : 0;
  const brotli = wantBrotli
    ? brotliCompressSync(buf, {
        params: {
          [zc.BROTLI_PARAM_QUALITY]: quality,
          [zc.BROTLI_PARAM_SIZE_HINT]: raw,
        },
      }).byteLength
    : 0;
  return { raw, gzip, brotli };
}

/** One measured file: its path plus sizes. */
export interface FileMeasure extends Sizes {
  /** The path as reported to the caller (usually relative to cwd). */
  path: string;
}

/** Read a file from disk and measure it. */
export function measureFile(path: string, reportPath: string, opts: MeasureOptions = {}): FileMeasure {
  const buf = readFileSync(path);
  return { path: reportPath, ...measureBuffer(buf, opts) };
}

/** The gzip-vs-raw compression ratio (0-1); 0 when raw is empty. */
export function ratio(s: Sizes, metric: "gzip" | "brotli" = "gzip"): number {
  if (s.raw === 0) return 0;
  return s[metric] / s.raw;
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return hi;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}
