/**
 * QR matrix construction: draw the function patterns (finders, separators,
 * timing, alignment, dark module, format & version information), lay the
 * codewords into the data region with the zig-zag walk, apply one of the eight
 * data masks (chosen by penalty score unless overridden), and write the final
 * format/version bits. Hand-written from ISO/IEC 18004.
 */
import type { EccLevel } from "./tables.js";
import { versionSize, alignmentPatternPositions, eccFormatBits } from "./tables.js";
import { encodeText } from "./encode.js";
import type { EncodeOptions, QrMode } from "./encode.js";

/** A fully rendered QR symbol. */
export interface QrCode {
  version: number;
  size: number;
  ecc: EccLevel;
  mask: number;
  mode: QrMode;
  /** Row-major module grid; `modules[y][x]` is true for a dark module. */
  modules: boolean[][];
}

/** Options for {@link makeQr}. */
export interface QrOptions extends EncodeOptions {
  /** Force one of the eight masks (0–7); default: lowest penalty. */
  mask?: number;
}

function getBit(x: number, i: number): boolean {
  return ((x >>> i) & 1) !== 0;
}

class Builder {
  readonly size: number;
  readonly modules: boolean[][];
  readonly isFunction: boolean[][];

  constructor(readonly version: number, readonly ecc: EccLevel) {
    this.size = versionSize(version);
    this.modules = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.isFunction = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
  }

  private set(x: number, y: number, dark: boolean): void {
    this.modules[y]![x] = dark;
    this.isFunction[y]![x] = true;
  }

  drawFunctionPatterns(): void {
    const size = this.size;
    // Timing patterns.
    for (let i = 0; i < size; i++) {
      this.set(6, i, i % 2 === 0);
      this.set(i, 6, i % 2 === 0);
    }
    // Finder patterns (with their separators) at three corners.
    this.drawFinder(3, 3);
    this.drawFinder(size - 4, 3);
    this.drawFinder(3, size - 4);
    // Alignment patterns.
    const pos = alignmentPatternPositions(this.version);
    const n = pos.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        // Skip the three that overlap the finder patterns.
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        this.drawAlignment(pos[i]!, pos[j]!);
      }
    }
    // Reserve format/version areas with placeholder bits.
    this.drawFormatBits(0);
    this.drawVersionInfo();
  }

  private drawFinder(cx: number, cy: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy)); // Chebyshev distance
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < this.size && y >= 0 && y < this.size) {
          this.set(x, y, dist !== 2 && dist !== 4);
        }
      }
    }
  }

  private drawAlignment(cx: number, cy: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  drawFormatBits(mask: number): void {
    const data = (eccFormatBits(this.ecc) << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412; // 15 bits, BCH + mask
    const size = this.size;

    // First copy, around the top-left finder.
    for (let i = 0; i <= 5; i++) this.set(8, i, getBit(bits, i));
    this.set(8, 7, getBit(bits, 6));
    this.set(8, 8, getBit(bits, 7));
    this.set(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, getBit(bits, i));

    // Second copy, split across the other two finders.
    for (let i = 0; i < 8; i++) this.set(size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) this.set(8, size - 15 + i, getBit(bits, i));
    this.set(8, size - 8, true); // always-dark module
  }

  private drawVersionInfo(): void {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem; // 18 bits
    for (let i = 0; i < 18; i++) {
      const color = getBit(bits, i);
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.set(a, b, color);
      this.set(b, a, color);
    }
  }

  drawCodewords(data: Uint8Array): void {
    const size = this.size;
    let i = 0; // bit index into data
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // skip the vertical timing column
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!this.isFunction[y]![x] && i < data.length * 8) {
            this.modules[y]![x] = getBit(data[i >>> 3]!, 7 - (i & 7));
            i++;
          }
        }
      }
    }
  }

  applyMask(mask: number): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.isFunction[y]![x]) continue;
        let invert: boolean;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: throw new Error(`invalid mask: ${mask}`);
        }
        if (invert) this.modules[y]![x] = !this.modules[y]![x];
      }
    }
  }

  penaltyScore(): number {
    const N1 = 3, N2 = 3, N3 = 40, N4 = 10;
    const size = this.size;
    let result = 0;

    // Rule 1 & 3: runs and finder-like patterns, per row then per column.
    for (let y = 0; y < size; y++) {
      let runColor = false;
      let runLen = 0;
      const history = [0, 0, 0, 0, 0, 0, 0];
      for (let x = 0; x < size; x++) {
        if (this.modules[y]![x] === runColor) {
          runLen++;
          if (runLen === 5) result += N1;
          else if (runLen > 5) result++;
        } else {
          this.addRunHistory(runLen, history);
          if (!runColor) result += this.countFinderPatterns(history) * N3;
          runColor = this.modules[y]![x]!;
          runLen = 1;
        }
      }
      result += this.terminateRun(runColor, runLen, history) * N3;
    }
    for (let x = 0; x < size; x++) {
      let runColor = false;
      let runLen = 0;
      const history = [0, 0, 0, 0, 0, 0, 0];
      for (let y = 0; y < size; y++) {
        if (this.modules[y]![x] === runColor) {
          runLen++;
          if (runLen === 5) result += N1;
          else if (runLen > 5) result++;
        } else {
          this.addRunHistory(runLen, history);
          if (!runColor) result += this.countFinderPatterns(history) * N3;
          runColor = this.modules[y]![x]!;
          runLen = 1;
        }
      }
      result += this.terminateRun(runColor, runLen, history) * N3;
    }

    // Rule 2: 2x2 blocks of one colour.
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = this.modules[y]![x];
        if (c === this.modules[y]![x + 1] && c === this.modules[y + 1]![x] && c === this.modules[y + 1]![x + 1]) {
          result += N2;
        }
      }
    }

    // Rule 4: overall dark/light balance.
    let dark = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (this.modules[y]![x]) dark++;
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * N4;
    return result;
  }

  private addRunHistory(run: number, history: number[]): void {
    if (history[0] === 0) run += this.size; // add the white border for the first run
    history.pop();
    history.unshift(run);
  }

  private countFinderPatterns(history: number[]): number {
    const n = history[1]!;
    const core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
    return (
      (core && history[0]! >= n * 4 && history[6]! >= n ? 1 : 0) +
      (core && history[6]! >= n * 4 && history[0]! >= n ? 1 : 0)
    );
  }

  private terminateRun(runColor: boolean, runLen: number, history: number[]): number {
    if (runColor) {
      this.addRunHistory(runLen, history);
      runLen = 0;
    }
    runLen += this.size; // add the white border to the final run
    this.addRunHistory(runLen, history);
    return this.countFinderPatterns(history);
  }
}

/** Build a full QR symbol from text, resolving version/mode/mask automatically. */
export function makeQr(text: string, opts: QrOptions = {}): QrCode {
  const encoded = encodeText(text, opts);
  const b = new Builder(encoded.version, encoded.ecc);
  b.drawFunctionPatterns();
  b.drawCodewords(encoded.codewords);

  let mask = opts.mask;
  if (mask === undefined) {
    let best = Number.MAX_SAFE_INTEGER;
    mask = 0;
    for (let m = 0; m < 8; m++) {
      b.applyMask(m);
      b.drawFormatBits(m);
      const penalty = b.penaltyScore();
      if (penalty < best) {
        best = penalty;
        mask = m;
      }
      b.applyMask(m); // undo (XOR is its own inverse)
    }
  } else if (mask < 0 || mask > 7) {
    throw new Error(`invalid mask: ${mask}`);
  }

  b.applyMask(mask);
  b.drawFormatBits(mask);

  return {
    version: encoded.version,
    size: b.size,
    ecc: encoded.ecc,
    mask,
    mode: encoded.mode,
    modules: b.modules,
  };
}
