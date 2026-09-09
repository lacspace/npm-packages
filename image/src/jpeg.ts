/**
 * Pure-JS baseline JPEG encoder (4:4:4, no external deps).
 * Adapted from the classic public-domain JPEG encoder (AAN forward DCT +
 * standard Huffman tables). Runs identically in Node and the browser and is
 * the engine the size-budget fitter tunes via the `quality` knob.
 */

import type { PixelSource } from "./types.js";

const ZIGZAG = Int32Array.of(
  0, 1, 5, 6, 14, 15, 27, 28, 2, 4, 7, 13, 16, 26, 29, 42, 3, 8, 12, 17, 25, 30, 41, 43, 9, 11, 18, 24, 31, 40, 44,
  53, 10, 19, 23, 32, 39, 45, 52, 54, 20, 22, 33, 38, 46, 51, 55, 60, 21, 34, 37, 47, 50, 56, 59, 61, 35, 36, 48, 49,
  57, 58, 62, 63,
);

const STD_DC_LUM_CODES = Int32Array.of(0, 0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0);
const STD_DC_LUM_VALUES = Int32Array.of(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11);
const STD_AC_LUM_CODES = Int32Array.of(0, 0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d);
const STD_AC_LUM_VALUES = Int32Array.of(
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14,
  0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09,
  0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a,
  0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65,
  0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88,
  0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9,
  0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca,
  0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea,
  0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
);
const STD_DC_CHR_CODES = Int32Array.of(0, 0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0);
const STD_DC_CHR_VALUES = Int32Array.of(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11);
const STD_AC_CHR_CODES = Int32Array.of(0, 0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77);
const STD_AC_CHR_VALUES = Int32Array.of(
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32,
  0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16,
  0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39,
  0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64,
  0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86,
  0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
  0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8,
  0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9,
  0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
);

const YQT = Int32Array.of(
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51,
  87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
);
const UVQT = Int32Array.of(
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99,
);
const AASF = Float64Array.of(1.0, 1.387039845, 1.306562965, 1.175875602, 1.0, 0.785694958, 0.5411961, 0.275899379);

interface HuffTable {
  code: Int32Array;
  len: Int32Array;
}

function computeHuffTable(nrcodes: Int32Array, values: Int32Array): HuffTable {
  const code = new Int32Array(256);
  const len = new Int32Array(256);
  let codeValue = 0;
  let pos = 0;
  for (let k = 1; k <= 16; k++) {
    for (let j = 1; j <= nrcodes[k]!; j++) {
      const v = values[pos]!;
      code[v] = codeValue;
      len[v] = k;
      pos++;
      codeValue++;
    }
    codeValue *= 2;
  }
  return { code, len };
}

export function encodeJpeg(source: PixelSource, quality = 82): Uint8Array {
  const q = Math.max(1, Math.min(100, Math.round(quality)));
  const sf = q < 50 ? Math.floor(5000 / q) : 200 - q * 2;

  const YTable = new Int32Array(64);
  const UVTable = new Int32Array(64);
  const fdtblY = new Float64Array(64);
  const fdtblUV = new Float64Array(64);

  for (let i = 0; i < 64; i++) {
    YTable[ZIGZAG[i]!] = Math.min(255, Math.max(1, Math.floor((YQT[i]! * sf + 50) / 100)));
    UVTable[ZIGZAG[i]!] = Math.min(255, Math.max(1, Math.floor((UVQT[i]! * sf + 50) / 100)));
  }
  {
    let i = 0;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        fdtblY[i] = 1.0 / (YTable[ZIGZAG[i]!]! * AASF[row]! * AASF[col]! * 8.0);
        fdtblUV[i] = 1.0 / (UVTable[ZIGZAG[i]!]! * AASF[row]! * AASF[col]! * 8.0);
        i++;
      }
    }
  }

  const YDC = computeHuffTable(STD_DC_LUM_CODES, STD_DC_LUM_VALUES);
  const YAC = computeHuffTable(STD_AC_LUM_CODES, STD_AC_LUM_VALUES);
  const UVDC = computeHuffTable(STD_DC_CHR_CODES, STD_DC_CHR_VALUES);
  const UVAC = computeHuffTable(STD_AC_CHR_CODES, STD_AC_CHR_VALUES);

  // Category + bit-code tables for value encoding (index = 32767 + value).
  const category = new Int32Array(65536);
  const bitCode = new Int32Array(65536);
  const bitLen = new Int32Array(65536);
  {
    let nrlower = 1;
    let nrupper = 2;
    for (let cat = 1; cat <= 15; cat++) {
      for (let nr = nrlower; nr < nrupper; nr++) {
        category[32767 + nr] = cat;
        bitLen[32767 + nr] = cat;
        bitCode[32767 + nr] = nr;
      }
      for (let nrneg = -(nrupper - 1); nrneg <= -nrlower; nrneg++) {
        category[32767 + nrneg] = cat;
        bitLen[32767 + nrneg] = cat;
        bitCode[32767 + nrneg] = nrupper - 1 + nrneg;
      }
      nrlower <<= 1;
      nrupper <<= 1;
    }
  }

  const out: number[] = [];
  let byteNew = 0;
  let bytePos = 7;
  const writeByte = (v: number) => out.push(v & 0xff);
  const writeWord = (v: number) => {
    out.push((v >>> 8) & 0xff);
    out.push(v & 0xff);
  };
  const writeBits = (value: number, length: number) => {
    let posval = length - 1;
    while (posval >= 0) {
      if (value & (1 << posval)) byteNew |= 1 << bytePos;
      posval--;
      bytePos--;
      if (bytePos < 0) {
        if (byteNew === 0xff) {
          writeByte(0xff);
          writeByte(0);
        } else {
          writeByte(byteNew);
        }
        bytePos = 7;
        byteNew = 0;
      }
    }
  };

  const data = new Float64Array(64);
  const outDU = new Int32Array(64);
  const DU = new Int32Array(64);

  const fDCTQuant = (fdtbl: Float64Array): Int32Array => {
    let off = 0;
    for (let i = 0; i < 8; i++) {
      const d0 = data[off]!, d1 = data[off + 1]!, d2 = data[off + 2]!, d3 = data[off + 3]!;
      const d4 = data[off + 4]!, d5 = data[off + 5]!, d6 = data[off + 6]!, d7 = data[off + 7]!;
      const t0 = d0 + d7, t7 = d0 - d7, t1 = d1 + d6, t6 = d1 - d6;
      const t2 = d2 + d5, t5 = d2 - d5, t3 = d3 + d4, t4 = d3 - d4;
      let t10 = t0 + t3;
      const t13 = t0 - t3;
      let t11 = t1 + t2;
      const t12 = t1 - t2;
      data[off] = t10 + t11;
      data[off + 4] = t10 - t11;
      const z1 = (t12 + t13) * 0.707106781;
      data[off + 2] = t13 + z1;
      data[off + 6] = t13 - z1;
      t10 = t4 + t5;
      t11 = t5 + t6;
      const t12b = t6 + t7;
      const z5 = (t10 - t12b) * 0.382683433;
      const z2 = 0.5411961 * t10 + z5;
      const z4 = 1.306562965 * t12b + z5;
      const z3 = t11 * 0.707106781;
      const z11 = t7 + z3;
      const z13 = t7 - z3;
      data[off + 5] = z13 + z2;
      data[off + 3] = z13 - z2;
      data[off + 1] = z11 + z4;
      data[off + 7] = z11 - z4;
      off += 8;
    }
    off = 0;
    for (let i = 0; i < 8; i++) {
      const d0 = data[off]!, d1 = data[off + 8]!, d2 = data[off + 16]!, d3 = data[off + 24]!;
      const d4 = data[off + 32]!, d5 = data[off + 40]!, d6 = data[off + 48]!, d7 = data[off + 56]!;
      const t0 = d0 + d7, t7 = d0 - d7, t1 = d1 + d6, t6 = d1 - d6;
      const t2 = d2 + d5, t5 = d2 - d5, t3 = d3 + d4, t4 = d3 - d4;
      let t10 = t0 + t3;
      const t13 = t0 - t3;
      let t11 = t1 + t2;
      const t12 = t1 - t2;
      data[off] = t10 + t11;
      data[off + 32] = t10 - t11;
      const z1 = (t12 + t13) * 0.707106781;
      data[off + 16] = t13 + z1;
      data[off + 48] = t13 - z1;
      t10 = t4 + t5;
      t11 = t5 + t6;
      const t12b = t6 + t7;
      const z5 = (t10 - t12b) * 0.382683433;
      const z2 = 0.5411961 * t10 + z5;
      const z4 = 1.306562965 * t12b + z5;
      const z3 = t11 * 0.707106781;
      const z11 = t7 + z3;
      const z13 = t7 - z3;
      data[off + 40] = z13 + z2;
      data[off + 24] = z13 - z2;
      data[off + 8] = z11 + z4;
      data[off + 56] = z11 - z4;
      off++;
    }
    for (let i = 0; i < 64; i++) {
      const v = data[i]! * fdtbl[i]!;
      outDU[i] = v > 0 ? (v + 0.5) | 0 : (v - 0.5) | 0;
    }
    return outDU;
  };

  const processDU = (fdtbl: Float64Array, dc: number, HTDC: HuffTable, HTAC: HuffTable): number => {
    const duDct = fDCTQuant(fdtbl);
    for (let j = 0; j < 64; j++) DU[ZIGZAG[j]!] = duDct[j]!;
    const diff = DU[0]! - dc;
    const newDc = DU[0]!;
    if (diff === 0) {
      writeBits(HTDC.code[0]!, HTDC.len[0]!);
    } else {
      const pos = 32767 + diff;
      writeBits(HTDC.code[category[pos]!]!, HTDC.len[category[pos]!]!);
      writeBits(bitCode[pos]!, bitLen[pos]!);
    }
    let end0 = 63;
    while (end0 > 0 && DU[end0] === 0) end0--;
    if (end0 === 0) {
      writeBits(HTAC.code[0]!, HTAC.len[0]!); // EOB
      return newDc;
    }
    let i = 1;
    while (i <= end0) {
      const start = i;
      while (DU[i] === 0 && i <= end0) i++;
      let nrzeroes = i - start;
      if (nrzeroes >= 16) {
        const lng = nrzeroes >> 4;
        for (let m = 1; m <= lng; m++) writeBits(HTAC.code[0xf0]!, HTAC.len[0xf0]!);
        nrzeroes &= 0xf;
      }
      const pos = 32767 + DU[i]!;
      const sym = (nrzeroes << 4) + category[pos]!;
      writeBits(HTAC.code[sym]!, HTAC.len[sym]!);
      writeBits(bitCode[pos]!, bitLen[pos]!);
      i++;
    }
    if (end0 !== 63) writeBits(HTAC.code[0]!, HTAC.len[0]!); // EOB
    return newDc;
  };

  const { width, height, data: px } = source;

  // ---- Headers ----
  writeWord(0xffd8); // SOI
  // APP0 / JFIF
  writeWord(0xffe0);
  writeWord(16);
  for (const c of [0x4a, 0x46, 0x49, 0x46, 0]) writeByte(c); // "JFIF\0"
  writeByte(1);
  writeByte(1);
  writeByte(0);
  writeWord(1);
  writeWord(1);
  writeByte(0);
  writeByte(0);
  // DQT
  writeWord(0xffdb);
  writeWord(132);
  writeByte(0);
  for (let i = 0; i < 64; i++) writeByte(YTable[i]!);
  writeByte(1);
  for (let i = 0; i < 64; i++) writeByte(UVTable[i]!);
  // SOF0
  writeWord(0xffc0);
  writeWord(17);
  writeByte(8);
  writeWord(height);
  writeWord(width);
  writeByte(3);
  writeByte(1);
  writeByte(0x11);
  writeByte(0);
  writeByte(2);
  writeByte(0x11);
  writeByte(1);
  writeByte(3);
  writeByte(0x11);
  writeByte(1);
  // DHT
  writeWord(0xffc4);
  writeWord(0x01a2);
  const writeHuffSpec = (cls: number, codes: Int32Array, values: Int32Array) => {
    writeByte(cls);
    for (let i = 1; i <= 16; i++) writeByte(codes[i]!);
    for (let i = 0; i < values.length; i++) writeByte(values[i]!);
  };
  writeHuffSpec(0x00, STD_DC_LUM_CODES, STD_DC_LUM_VALUES);
  writeHuffSpec(0x10, STD_AC_LUM_CODES, STD_AC_LUM_VALUES);
  writeHuffSpec(0x01, STD_DC_CHR_CODES, STD_DC_CHR_VALUES);
  writeHuffSpec(0x11, STD_AC_CHR_CODES, STD_AC_CHR_VALUES);
  // SOS
  writeWord(0xffda);
  writeWord(12);
  writeByte(3);
  writeByte(1);
  writeByte(0);
  writeByte(2);
  writeByte(0x11);
  writeByte(3);
  writeByte(0x11);
  writeByte(0);
  writeByte(0x3f);
  writeByte(0);

  // ---- Entropy-coded scan (4:4:4) ----
  let dcY = 0;
  let dcU = 0;
  let dcV = 0;
  byteNew = 0;
  bytePos = 7;
  const clampX = (x: number) => (x < 0 ? 0 : x >= width ? width - 1 : x);
  const clampY = (y: number) => (y < 0 ? 0 : y >= height ? height - 1 : y);

  for (let by = 0; by < height; by += 8) {
    for (let bx = 0; bx < width; bx += 8) {
      // Y
      let k = 0;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const i = (clampY(by + r) * width + clampX(bx + c)) * 4;
          const R = px[i]!, G = px[i + 1]!, B = px[i + 2]!;
          data[k++] = 0.299 * R + 0.587 * G + 0.114 * B - 128;
        }
      }
      dcY = processDU(fdtblY, dcY, YDC, YAC);
      // U
      k = 0;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const i = (clampY(by + r) * width + clampX(bx + c)) * 4;
          const R = px[i]!, G = px[i + 1]!, B = px[i + 2]!;
          data[k++] = -0.16874 * R - 0.33126 * G + 0.5 * B;
        }
      }
      dcU = processDU(fdtblUV, dcU, UVDC, UVAC);
      // V
      k = 0;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const i = (clampY(by + r) * width + clampX(bx + c)) * 4;
          const R = px[i]!, G = px[i + 1]!, B = px[i + 2]!;
          data[k++] = 0.5 * R - 0.41869 * G - 0.08131 * B;
        }
      }
      dcV = processDU(fdtblUV, dcV, UVDC, UVAC);
    }
  }

  // Flush remaining bits (pad with 1s) then EOI.
  if (bytePos !== 7) writeBits(0x7f, 7);
  writeWord(0xffd9);

  return Uint8Array.from(out);
}
