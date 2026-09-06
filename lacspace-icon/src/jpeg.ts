/**
 * A compact, zero-dependency **baseline** JPEG decoder. It reads sequential
 * (baseline) DCT JPEGs — the kind virtually every logo export, phone camera and
 * `sips`/`convert -quality` file produces — and returns straight RGBA, so a user
 * can hand a `.jpg` logo straight to lacspace-icon.
 *
 * It implements the whole baseline pipeline itself: marker parsing, Huffman
 * decoding, dequantization, a separable inverse DCT, chroma upsampling and the
 * YCbCr→RGB (or grayscale) colour transform. No native modules, no dependencies.
 *
 * LIMITATIONS (documented, and thrown with a clear message):
 *  - **Progressive** JPEGs are not supported (SOF2). Re-export as baseline.
 *  - **12-bit** and arithmetic-coded JPEGs are not supported.
 *  - **CMYK / YCCK** (4-component) JPEGs are not supported.
 */
import type { ImageData } from "./png.js";

/** Zig-zag position → natural (row-major) index within an 8×8 block. */
const ZIGZAG = Int32Array.from([
  0, 1, 8, 16, 9, 2, 3, 10,
  17, 24, 32, 25, 18, 11, 4, 5,
  12, 19, 26, 33, 40, 48, 41, 34,
  27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36,
  29, 22, 15, 23, 30, 37, 44, 51,
  58, 59, 52, 45, 38, 31, 39, 46,
  53, 60, 61, 54, 47, 55, 62, 63,
]);

/** True if the bytes start with the JPEG SOI marker (FF D8). */
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

interface HuffTable {
  // Root children array. A slot holds either a leaf value (number) or another
  // children array (internal node), walked one bit at a time.
  tree: unknown[];
}

interface HuffNode {
  children: unknown[];
  index: number;
}

/**
 * Build a Huffman decode tree from the DHT (16 code-length counts + values).
 * Canonical construction adapted from the well-known pdf.js baseline decoder.
 */
function buildHuffTable(counts: Uint8Array, values: Uint8Array): HuffTable {
  let length = 16;
  while (length > 0 && !counts[length - 1]) length--;
  const code: HuffNode[] = [{ children: [], index: 0 }];
  let p = code[0]!;
  let q: HuffNode;
  let k = 0;
  for (let i = 0; i < length; i++) {
    for (let j = 0; j < counts[i]!; j++) {
      p = code.pop()!;
      p.children[p.index] = values[k]!;
      while (p.index > 0) p = code.pop()!;
      p.index++;
      code.push(p);
      while (code.length <= i) {
        q = { children: [], index: 0 };
        code.push(q);
        p.children[p.index] = q.children;
        p = q;
      }
      k++;
    }
    if (i + 1 < length) {
      q = { children: [], index: 0 };
      code.push(q);
      p.children[p.index] = q.children;
      p = q;
    }
  }
  return { tree: code[0]!.children };
}

/** Streaming bit reader over the entropy-coded segment (handles 0xFF stuffing). */
class BitReader {
  private bitBuf = 0;
  private bitCnt = 0;
  marker = 0; // set to the marker byte (e.g. 0xD0..0xD7 restart) when one is hit
  constructor(private readonly data: Uint8Array, public pos: number) {}

  /** Read one bit, or -1 at a marker / end of data. */
  private bit(): number {
    if (this.bitCnt === 0) {
      if (this.pos >= this.data.length) return -1;
      let b = this.data[this.pos++]!;
      if (b === 0xff) {
        const n = this.data[this.pos] ?? 0;
        if (n === 0) {
          this.pos++; // stuffed 0xFF00 → literal 0xFF
        } else {
          this.marker = n;
          this.pos--; // leave the FF for the marker scan
          return -1;
        }
      }
      this.bitBuf = b;
      this.bitCnt = 8;
    }
    this.bitCnt--;
    return (this.bitBuf >> this.bitCnt) & 1;
  }

  /** Decode one symbol through a Huffman tree. */
  decode(table: HuffTable): number {
    let node: unknown = table.tree;
    for (let i = 0; i < 16; i++) {
      const b = this.bit();
      if (b < 0) return 0;
      node = (node as unknown[])[b];
      if (typeof node === "number") return node;
      if (node === undefined) return 0;
    }
    return 0;
  }

  /** Read `n` bits as an unsigned integer. */
  receive(n: number): number {
    let v = 0;
    while (n-- > 0) {
      const b = this.bit();
      if (b < 0) break;
      v = (v << 1) | b;
    }
    return v;
  }

  /** Read `n` bits and sign-extend (JPEG "RECEIVE and EXTEND"). */
  receiveExtend(n: number): number {
    if (n === 0) return 0;
    const v = this.receive(n);
    return v < 1 << (n - 1) ? v + (-1 << n) + 1 : v;
  }

  reset(): void {
    this.bitBuf = 0;
    this.bitCnt = 0;
    this.marker = 0;
  }
}

interface Component {
  id: number;
  h: number;
  v: number;
  quantId: number;
  quant?: Int32Array; // natural-order dequant table
  dcTable?: HuffTable;
  acTable?: HuffTable;
  pred: number;
  blocksPerLine: number;
  blocksPerColumn: number;
  blocks: Int16Array; // blocksPerLine*blocksPerColumn*64, natural order
}

function readU16(b: Uint8Array, o: number): number {
  return (b[o]! << 8) | b[o + 1]!;
}

// Precomputed separable IDCT cosine weights.
const IDCT_COS: Float64Array = (() => {
  const t = new Float64Array(64);
  for (let k = 0; k < 8; k++) {
    const ck = k === 0 ? Math.SQRT1_2 : 1;
    for (let n = 0; n < 8; n++) {
      t[k * 8 + n] = ck * Math.cos(((2 * n + 1) * k * Math.PI) / 16);
    }
  }
  return t;
})();

/** Separable inverse DCT of a dequantized 8×8 block, level-shifted to 0..255. */
function idct8x8(block: Int32Array, out: Uint8Array): void {
  const tmp = new Float64Array(64);
  // Columns: for each column x, transform the 8 vertical coefficients.
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      let s = 0;
      for (let v = 0; v < 8; v++) s += IDCT_COS[v * 8 + y]! * block[v * 8 + x]!;
      tmp[y * 8 + x] = s;
    }
  }
  // Rows: transform horizontally, scale by 1/4, level-shift by 128.
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      let s = 0;
      for (let u = 0; u < 8; u++) s += IDCT_COS[u * 8 + x]! * tmp[y * 8 + u]!;
      const val = Math.round(s / 4) + 128;
      out[y * 8 + x] = val < 0 ? 0 : val > 255 ? 255 : val;
    }
  }
}

/**
 * Decode a baseline JPEG into straight RGBA.
 * @throws with a clear message for unsupported (progressive / CMYK / 12-bit) files.
 */
export function decodeJpeg(bytes: Uint8Array): ImageData {
  if (!isJpeg(bytes)) throw new Error("Not a JPEG file (bad SOI marker).");

  const quantTables: (Int32Array | undefined)[] = [];
  const huffDC: (HuffTable | undefined)[] = [];
  const huffAC: (HuffTable | undefined)[] = [];
  let frameWidth = 0;
  let frameHeight = 0;
  let components: Component[] = [];
  let maxH = 1;
  let maxV = 1;
  let restartInterval = 0;
  let adobeTransform = -1;

  let pos = 2; // skip SOI
  while (pos < bytes.length) {
    if (bytes[pos] !== 0xff) {
      pos++;
      continue;
    }
    let marker = bytes[pos + 1]!;
    pos += 2;
    if (marker === 0xd9) break; // EOI
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue; // TEM / stray RST
    const len = readU16(bytes, pos);
    const segEnd = pos + len;
    const seg = bytes.subarray(pos + 2, segEnd);

    if (marker === 0xdb) {
      // DQT
      let o = 0;
      while (o < seg.length) {
        const pq = seg[o]! >> 4; // 0 = 8-bit, 1 = 16-bit
        const tq = seg[o]! & 15;
        o++;
        if (pq !== 0) throw new Error("16-bit JPEG quantization tables are not supported.");
        const table = new Int32Array(64);
        for (let i = 0; i < 64; i++) table[ZIGZAG[i]!] = seg[o + i]!;
        o += 64;
        quantTables[tq] = table;
      }
    } else if (marker === 0xc0 || marker === 0xc1) {
      // SOF0 / SOF1 (baseline / extended sequential)
      const precision = seg[0]!;
      if (precision !== 8) throw new Error(`Only 8-bit JPEGs are supported (got ${precision}-bit).`);
      frameHeight = readU16(seg, 1);
      frameWidth = readU16(seg, 3);
      const count = seg[5]!;
      let o = 6;
      components = [];
      maxH = 1;
      maxV = 1;
      for (let i = 0; i < count; i++) {
        const id = seg[o]!;
        const h = seg[o + 1]! >> 4;
        const v = seg[o + 1]! & 15;
        const quantId = seg[o + 2]!;
        o += 3;
        maxH = Math.max(maxH, h);
        maxV = Math.max(maxV, v);
        components.push({ id, h, v, quantId, pred: 0, blocksPerLine: 0, blocksPerColumn: 0, blocks: new Int16Array(0) });
      }
    } else if (marker === 0xc2) {
      throw new Error("Progressive JPEGs are not supported — re-export as baseline.");
    } else if (marker === 0xc3 || (marker >= 0xc5 && marker <= 0xcf && marker !== 0xc8)) {
      throw new Error("This JPEG uses an unsupported coding mode (only baseline DCT is supported).");
    } else if (marker === 0xc4) {
      // DHT
      let o = 0;
      while (o < seg.length) {
        const tc = seg[o]! >> 4; // 0 = DC, 1 = AC
        const th = seg[o]! & 15;
        o++;
        const counts = seg.subarray(o, o + 16);
        o += 16;
        let total = 0;
        for (let i = 0; i < 16; i++) total += counts[i]!;
        const values = seg.subarray(o, o + total);
        o += total;
        const table = buildHuffTable(counts, values);
        if (tc === 0) huffDC[th] = table;
        else huffAC[th] = table;
      }
    } else if (marker === 0xdd) {
      // DRI
      restartInterval = readU16(seg, 0);
    } else if (marker === 0xee) {
      // APP14 Adobe → colour transform hint
      if (seg.length >= 12 && seg[0] === 0x41 && seg[1] === 0x64) adobeTransform = seg[11]!;
    } else if (marker === 0xda) {
      // SOS — start of scan; decode the entropy-coded data that follows.
      const ns = seg[0]!;
      const scanComps: Component[] = [];
      let o = 1;
      for (let i = 0; i < ns; i++) {
        const cs = seg[o]!;
        const td = seg[o + 1]! >> 4;
        const ta = seg[o + 1]! & 15;
        o += 2;
        const comp = components.find((c) => c.id === cs);
        if (!comp) throw new Error("SOS references an unknown component.");
        comp.dcTable = huffDC[td];
        comp.acTable = huffAC[ta];
        scanComps.push(comp);
      }
      // Ss/Se/Ah/Al ignored (baseline: 0/63/0/0).
      pos = decodeScan(bytes, segEnd, frameWidth, frameHeight, components, scanComps, maxH, maxV, quantTables, restartInterval);
      continue;
    }
    pos = segEnd;
  }

  if (frameWidth <= 0 || frameHeight <= 0) throw new Error("JPEG has no valid frame header (SOF0).");
  return assemble(frameWidth, frameHeight, components, maxH, maxV, adobeTransform);
}

/** Decode the interleaved entropy-coded scan; returns the byte position after it. */
function decodeScan(
  bytes: Uint8Array,
  start: number,
  width: number,
  height: number,
  components: Component[],
  scanComps: Component[],
  maxH: number,
  maxV: number,
  quantTables: (Int32Array | undefined)[],
  restartInterval: number,
): number {
  const mcusPerLine = Math.ceil(width / (8 * maxH));
  const mcusPerColumn = Math.ceil(height / (8 * maxV));

  for (const c of components) {
    c.blocksPerLine = Math.ceil((width / 8) * (c.h / maxH));
    c.blocksPerColumn = Math.ceil((height / 8) * (c.v / maxV));
    // Allocate to full MCU grid so we never index out of bounds.
    const bpl = mcusPerLine * c.h;
    const bpc = mcusPerColumn * c.v;
    c.blocksPerLine = bpl;
    c.blocksPerColumn = bpc;
    c.blocks = new Int16Array(bpl * bpc * 64);
    c.quant = quantTables[c.quantId];
    c.pred = 0;
  }

  const reader = new BitReader(bytes, start);
  const totalMcus = mcusPerLine * mcusPerColumn;
  let mcu = 0;
  let sinceRestart = 0;

  const decodeBlock = (comp: Component, blockRow: number, blockCol: number): void => {
    const base = (blockRow * comp.blocksPerLine + blockCol) * 64;
    const blocks = comp.blocks;
    // DC
    const t = reader.decode(comp.dcTable!);
    const diff = t === 0 ? 0 : reader.receiveExtend(t);
    comp.pred += diff;
    blocks[base] = comp.pred;
    // AC
    let k = 1;
    while (k < 64) {
      const rs = reader.decode(comp.acTable!);
      const s = rs & 15;
      const r = rs >> 4;
      if (s === 0) {
        if (r < 15) break;
        k += 16;
        continue;
      }
      k += r;
      if (k >= 64) break;
      blocks[base + ZIGZAG[k]!] = reader.receiveExtend(s);
      k++;
    }
  };

  while (mcu < totalMcus) {
    const mcuRow = Math.floor(mcu / mcusPerLine);
    const mcuCol = mcu % mcusPerLine;
    for (const comp of scanComps) {
      for (let v = 0; v < comp.v; v++) {
        for (let h = 0; h < comp.h; h++) {
          decodeBlock(comp, mcuRow * comp.v + v, mcuCol * comp.h + h);
        }
      }
    }
    mcu++;
    sinceRestart++;

    if (restartInterval && sinceRestart === restartInterval && mcu < totalMcus) {
      // Align to the RSTn marker and reset predictors.
      reader.reset();
      // Skip to the marker.
      while (reader.pos < bytes.length) {
        if (bytes[reader.pos] === 0xff) {
          const m = bytes[reader.pos + 1]!;
          if (m >= 0xd0 && m <= 0xd7) {
            reader.pos += 2;
            break;
          }
          if (m !== 0x00) break;
        }
        reader.pos++;
      }
      for (const c of scanComps) c.pred = 0;
      sinceRestart = 0;
    }
  }

  // Advance to the next marker following the scan data.
  let p = reader.pos;
  while (p + 1 < bytes.length) {
    if (bytes[p] === 0xff) {
      const m = bytes[p + 1]!;
      if (m !== 0x00 && !(m >= 0xd0 && m <= 0xd7)) return p;
    }
    p++;
  }
  return bytes.length;
}

/** IDCT every block, upsample each component, colour-convert to RGBA. */
function assemble(
  width: number,
  height: number,
  components: Component[],
  maxH: number,
  maxV: number,
  adobeTransform: number,
): ImageData {
  // Build a full-resolution sample plane per component.
  const planes: Uint8Array[] = [];
  const blockOut = new Uint8Array(64);
  for (const comp of components) {
    if (!comp.quant) throw new Error("JPEG component is missing its quantization table.");
    const compW = comp.blocksPerLine * 8;
    const compH = comp.blocksPerColumn * 8;
    const samples = new Uint8Array(compW * compH);
    const work = new Int32Array(64);
    for (let by = 0; by < comp.blocksPerColumn; by++) {
      for (let bx = 0; bx < comp.blocksPerLine; bx++) {
        const base = (by * comp.blocksPerLine + bx) * 64;
        for (let i = 0; i < 64; i++) work[i] = comp.blocks[base + i]! * comp.quant[i]!;
        idct8x8(work, blockOut);
        const ox = bx * 8;
        const oy = by * 8;
        for (let y = 0; y < 8; y++) {
          const row = (oy + y) * compW + ox;
          for (let x = 0; x < 8; x++) samples[row + x] = blockOut[y * 8 + x]!;
        }
      }
    }
    // Upsample this component's plane to full width×height (nearest).
    const full = new Uint8Array(width * height);
    const sx = comp.h / maxH;
    const sy = comp.v / maxV;
    for (let y = 0; y < height; y++) {
      const srcY = Math.min(compH - 1, (y * sy) | 0);
      for (let x = 0; x < width; x++) {
        const srcX = Math.min(compW - 1, (x * sx) | 0);
        full[y * width + x] = samples[srcY * compW + srcX]!;
      }
    }
    planes.push(full);
  }

  const rgba = new Uint8Array(width * height * 4);
  const n = width * height;
  if (planes.length === 1) {
    const g = planes[0]!;
    for (let p = 0; p < n; p++) {
      const v = g[p]!;
      rgba[p * 4] = v;
      rgba[p * 4 + 1] = v;
      rgba[p * 4 + 2] = v;
      rgba[p * 4 + 3] = 255;
    }
  } else if (planes.length === 3) {
    // transform<0 → default: JFIF assumes YCbCr; Adobe transform 0 means RGB.
    const isRGB = adobeTransform === 0;
    const [c0, c1, c2] = planes as [Uint8Array, Uint8Array, Uint8Array];
    for (let p = 0; p < n; p++) {
      let r: number, g: number, b: number;
      if (isRGB) {
        r = c0[p]!;
        g = c1[p]!;
        b = c2[p]!;
      } else {
        const Y = c0[p]!;
        const Cb = c1[p]! - 128;
        const Cr = c2[p]! - 128;
        r = Y + 1.402 * Cr;
        g = Y - 0.344136 * Cb - 0.714136 * Cr;
        b = Y + 1.772 * Cb;
      }
      rgba[p * 4] = clamp(r);
      rgba[p * 4 + 1] = clamp(g);
      rgba[p * 4 + 2] = clamp(b);
      rgba[p * 4 + 3] = 255;
    }
  } else {
    throw new Error(`Unsupported JPEG with ${planes.length} colour components (CMYK/YCCK not supported).`);
  }
  return { width, height, rgba };
}

function clamp(v: number): number {
  const r = v < 0 ? 0 : v > 255 ? 255 : v;
  return (r + 0.5) | 0;
}
