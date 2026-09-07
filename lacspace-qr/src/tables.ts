/**
 * Static QR-code capacity tables and geometry helpers, straight from
 * ISO/IEC 18004. The two big tables (error-correction codewords per block and
 * the number of error-correction blocks) plus the raw-module formula let us
 * derive every capacity number without a giant hand-typed capacity matrix.
 */

/** Error-correction level. */
export type EccLevel = "L" | "M" | "Q" | "H";

/** The four levels in table order (L, M, Q, H). */
export const ECC_LEVELS: readonly EccLevel[] = ["L", "M", "Q", "H"] as const;

/** Table index for a level: L=0, M=1, Q=2, H=3. */
export function eccIndex(level: EccLevel): number {
  const i = ECC_LEVELS.indexOf(level);
  if (i < 0) throw new Error(`Unknown ECC level: ${level}`);
  return i;
}

/** 2-bit format value written into the symbol: L=1, M=0, Q=3, H=2. */
export function eccFormatBits(level: EccLevel): number {
  return { L: 1, M: 0, Q: 3, H: 2 }[level];
}

export const MIN_VERSION = 1;
export const MAX_VERSION = 40;

// Error-correction codewords per block, indexed [eccIndex][version]. Index 0 of
// each row is padding for the unused "version 0".
export const ECC_CODEWORDS_PER_BLOCK: readonly (readonly number[])[] = [
  // L
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  // M
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  // Q
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  // H
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

// Number of error-correction blocks, indexed [eccIndex][version].
export const NUM_ERROR_CORRECTION_BLOCKS: readonly (readonly number[])[] = [
  // L
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  // M
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  // Q
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  // H
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

/** Side length of a symbol (modules per side) for a version. */
export function versionSize(version: number): number {
  return version * 4 + 17;
}

/**
 * Total number of data modules for a version — i.e. all modules minus the
 * function patterns (finders, timing, alignment, format/version info). The
 * result is a bit count; floor(/8) is the number of codewords.
 */
export function numRawDataModules(version: number): number {
  if (version < MIN_VERSION || version > MAX_VERSION) throw new Error(`version out of range: ${version}`);
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

/** Total codewords (data + error correction) for a version. */
export function numRawCodewords(version: number): number {
  return Math.floor(numRawDataModules(version) / 8);
}

/** Number of usable data codewords for a version + ECC level. */
export function numDataCodewords(version: number, level: EccLevel): number {
  const e = eccIndex(level);
  const raw = numRawCodewords(version);
  const ecc = ECC_CODEWORDS_PER_BLOCK[e]![version]! * NUM_ERROR_CORRECTION_BLOCKS[e]![version]!;
  return raw - ecc;
}

/** Data capacity in bits for a version + ECC level. */
export function dataCapacityBits(version: number, level: EccLevel): number {
  return numDataCodewords(version, level) * 8;
}

/**
 * Centre coordinates of the alignment patterns for a version (empty for
 * version 1). The Cartesian product of these positions gives every alignment
 * centre; the three that collide with finder patterns are skipped by the
 * matrix builder.
 */
export function alignmentPatternPositions(version: number): number[] {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const size = versionSize(version);
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result: number[] = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}
