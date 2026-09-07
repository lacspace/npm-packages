/**
 * Data encoding for QR codes: choose an encoding mode, build the mode/
 * character-count/data bit stream, select the smallest fitting version, pad to
 * capacity, then split into blocks and append Reed–Solomon error correction
 * with the standard interleaving. All hand-written, zero dependencies.
 */
import type { EccLevel } from "./tables.js";
import {
  MAX_VERSION,
  MIN_VERSION,
  numRawCodewords,
  numDataCodewords,
  dataCapacityBits,
  eccIndex,
  ECC_CODEWORDS_PER_BLOCK,
  NUM_ERROR_CORRECTION_BLOCKS,
} from "./tables.js";
import { rsComputeDivisor, rsComputeRemainder } from "./gf.js";

/** Encoding mode. */
export type QrMode = "numeric" | "alphanumeric" | "byte";

/** The 45-character alphanumeric set, indexed by value. */
export const ALPHANUMERIC_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

const MODE_INDICATOR: Record<QrMode, number> = { numeric: 0x1, alphanumeric: 0x2, byte: 0x4 };

/** A growable stream of bits, MSB-first. */
export class BitBuffer {
  readonly bits: number[] = [];
  /** Append the low `len` bits of `value`. */
  push(value: number, len: number): void {
    if (len < 0 || value >>> len !== 0) {
      // allow values that fit; guard against silent truncation of bad input
      if (value < 0 || len < 0) throw new Error("BitBuffer.push: invalid value/len");
    }
    for (let i = len - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
  get length(): number {
    return this.bits.length;
  }
  /** Pack the bits into bytes (MSB-first), zero-padding the final byte. */
  toBytes(): Uint8Array {
    const out = new Uint8Array(Math.ceil(this.bits.length / 8));
    for (let i = 0; i < this.bits.length; i++) {
      if (this.bits[i]) out[i >>> 3]! |= 1 << (7 - (i & 7));
    }
    return out;
  }
}

/** True if every character is an ASCII digit. */
export function isNumeric(text: string): boolean {
  return text.length > 0 && /^[0-9]+$/.test(text);
}

/** True if every character is in the alphanumeric QR set. */
export function isAlphanumeric(text: string): boolean {
  if (text.length === 0) return false;
  for (const ch of text) if (ALPHANUMERIC_CHARSET.indexOf(ch) < 0) return false;
  return true;
}

/** Pick the most compact single mode that can represent the text. */
export function selectMode(text: string): QrMode {
  if (isNumeric(text)) return "numeric";
  if (isAlphanumeric(text)) return "alphanumeric";
  return "byte";
}

/** Character-count-indicator bit length for a mode at a given version. */
export function charCountBits(mode: QrMode, version: number): number {
  const group = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  const table: Record<QrMode, [number, number, number]> = {
    numeric: [10, 12, 14],
    alphanumeric: [9, 11, 13],
    byte: [8, 16, 16],
  };
  return table[mode][group];
}

/** UTF-8 bytes for byte-mode content (the character count is the byte length). */
export function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Number of characters that go into the character-count indicator. */
export function charCount(mode: QrMode, text: string): number {
  return mode === "byte" ? utf8Bytes(text).length : text.length;
}

/** Bit length of the encoded data payload (excluding mode + count headers). */
export function dataBitLength(mode: QrMode, text: string): number {
  if (mode === "numeric") {
    const n = text.length;
    return 10 * Math.floor(n / 3) + (n % 3 === 1 ? 4 : n % 3 === 2 ? 7 : 0);
  }
  if (mode === "alphanumeric") {
    const n = text.length;
    return 11 * Math.floor(n / 2) + (n % 2 === 1 ? 6 : 0);
  }
  return utf8Bytes(text).length * 8;
}

/** Append the encoded data payload for a mode to a bit buffer. */
export function encodeData(bb: BitBuffer, mode: QrMode, text: string): void {
  if (mode === "numeric") {
    for (let i = 0; i < text.length; i += 3) {
      const chunk = text.slice(i, i + 3);
      bb.push(parseInt(chunk, 10), chunk.length * 3 + 1);
    }
  } else if (mode === "alphanumeric") {
    for (let i = 0; i < text.length; i += 2) {
      if (i + 1 < text.length) {
        const v = ALPHANUMERIC_CHARSET.indexOf(text[i]!) * 45 + ALPHANUMERIC_CHARSET.indexOf(text[i + 1]!);
        bb.push(v, 11);
      } else {
        bb.push(ALPHANUMERIC_CHARSET.indexOf(text[i]!), 6);
      }
    }
  } else {
    for (const byte of utf8Bytes(text)) bb.push(byte, 8);
  }
}

export interface EncodeOptions {
  ecc?: EccLevel;
  /** Force a specific symbol version (1–40). */
  version?: number;
  /** Lower bound for the auto-selected version. */
  minVersion?: number;
  /** Force a specific encoding mode instead of auto-selecting. */
  mode?: QrMode;
}

export interface EncodedData {
  mode: QrMode;
  version: number;
  ecc: EccLevel;
  /** All codewords, blocks interleaved, data followed by error correction. */
  codewords: Uint8Array;
}

/** Total header+data bits for a mode/text at a given version. */
export function totalBits(mode: QrMode, text: string, version: number): number {
  return 4 + charCountBits(mode, version) + dataBitLength(mode, text);
}

/** Choose the smallest version (respecting bounds) whose capacity fits. */
export function selectVersion(mode: QrMode, text: string, ecc: EccLevel, minVersion: number): number {
  for (let v = Math.max(MIN_VERSION, minVersion); v <= MAX_VERSION; v++) {
    if (totalBits(mode, text, v) <= dataCapacityBits(v, ecc)) return v;
  }
  throw new Error(`Data too long to fit in any QR version at ECC level ${ecc}.`);
}

/**
 * Encode text into the final, interleaved codeword stream ready for matrix
 * placement, resolving mode/version automatically unless overridden.
 */
export function encodeText(text: string, opts: EncodeOptions = {}): EncodedData {
  const ecc: EccLevel = opts.ecc ?? "M";
  const mode: QrMode = opts.mode ?? selectMode(text);
  const minVersion = opts.minVersion ?? MIN_VERSION;

  let version: number;
  if (opts.version !== undefined) {
    version = opts.version;
    if (version < MIN_VERSION || version > MAX_VERSION) throw new Error(`version out of range: ${version}`);
    if (totalBits(mode, text, version) > dataCapacityBits(version, ecc)) {
      throw new Error(`Data does not fit in version ${version} at ECC level ${ecc}.`);
    }
    if (version < minVersion) version = Math.max(version, minVersion);
  } else {
    version = selectVersion(mode, text, ecc, minVersion);
  }

  // Build the data bit stream.
  const bb = new BitBuffer();
  bb.push(MODE_INDICATOR[mode], 4);
  bb.push(charCount(mode, text), charCountBits(mode, version));
  encodeData(bb, mode, text);

  const capacityBits = dataCapacityBits(version, ecc);
  // Terminator: up to four zero bits.
  const terminator = Math.min(4, capacityBits - bb.length);
  bb.push(0, terminator);
  // Pad to a byte boundary.
  bb.push(0, (8 - (bb.length % 8)) % 8);

  const dataCodewords = bb.toBytes();
  const targetLen = numDataCodewords(version, ecc);
  const padded = new Uint8Array(targetLen);
  padded.set(dataCodewords.subarray(0, targetLen));
  // Fill remaining codewords with the standard alternating pad bytes.
  for (let i = dataCodewords.length, pad = 0; i < targetLen; i++, pad++) {
    padded[i] = pad % 2 === 0 ? 0xec : 0x11;
  }

  const codewords = addEccAndInterleave(padded, version, ecc);
  return { mode, version, ecc, codewords };
}

/**
 * Split data codewords into blocks, append Reed–Solomon error correction to
 * each, and interleave the blocks (data columns, then ECC columns) exactly as
 * the standard requires.
 */
export function addEccAndInterleave(data: Uint8Array, version: number, ecc: EccLevel): Uint8Array {
  const e = eccIndex(ecc);
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[e]![version]!;
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[e]![version]!;
  const rawCodewords = numRawCodewords(version);
  if (data.length !== numDataCodewords(version, ecc)) {
    throw new Error("addEccAndInterleave: data length mismatch");
  }
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const divisor = rsComputeDivisor(blockEccLen);
  const blocks: Uint8Array[] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
    const dat = data.subarray(k, k + datLen);
    k += datLen;
    const remainder = rsComputeRemainder(dat, divisor);
    // Short blocks get a placeholder byte so all blocks share a max length for
    // interleaving; the placeholder is skipped when reading back out.
    const block = new Uint8Array(shortBlockLen + 1);
    block.set(dat, 0);
    block.set(remainder, block.length - blockEccLen);
    blocks.push(block);
  }

  const result: number[] = [];
  const maxLen = shortBlockLen + 1;
  for (let i = 0; i < maxLen; i++) {
    for (let j = 0; j < blocks.length; j++) {
      // Skip the placeholder column in the short blocks.
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) {
        result.push(blocks[j]![i]!);
      }
    }
  }
  return Uint8Array.from(result);
}
