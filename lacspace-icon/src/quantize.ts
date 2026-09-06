/**
 * Indexed-PNG (colour-type 3) encoder with colour quantization. Small favicons
 * are usually a handful of flat colours, so storing them as 1-byte palette
 * indices instead of 4-byte RGBA — then deflating — shrinks them noticeably.
 *
 * When the image has ≤ maxColors distinct colours the palette is exact and the
 * encode is lossless (it round-trips byte-for-byte through {@link decodePng}).
 * Above that, a median-cut quantizer reduces the palette.
 */
import type { ImageData } from "./png.js";
import { deflateSync } from "node:zlib";
import { crc32 } from "./png.js";

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

function writeChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

interface Entry {
  r: number;
  g: number;
  b: number;
  a: number;
  count: number;
  key: number;
  pi: number; // assigned palette index (filled in later)
}

/** Median-cut a set of distinct colours down to at most `maxColors` boxes. */
function medianCut(entries: Entry[], maxColors: number): Entry[][] {
  let boxes: Entry[][] = [entries];
  const channelKey: (keyof Entry)[] = ["r", "g", "b", "a"];
  while (boxes.length < maxColors) {
    // Find the box with the greatest colour range on any channel.
    let bestBox = -1;
    let bestRange = -1;
    let bestChan: keyof Entry = "r";
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]!;
      if (box.length < 2) continue;
      for (const ch of channelKey) {
        let lo = 255;
        let hi = 0;
        for (const e of box) {
          const v = e[ch] as number;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        const range = hi - lo;
        if (range > bestRange) {
          bestRange = range;
          bestBox = i;
          bestChan = ch;
        }
      }
    }
    if (bestBox < 0) break; // nothing left to split
    const box = boxes[bestBox]!;
    box.sort((p, q) => (p[bestChan] as number) - (q[bestChan] as number));
    const mid = box.length >> 1;
    boxes.splice(bestBox, 1, box.slice(0, mid), box.slice(mid));
  }
  return boxes;
}

interface Quantized {
  /** Palette as flat RGBA, one entry per colour. */
  palette: [number, number, number, number][];
  /** One palette index per pixel. */
  indices: Uint8Array;
}

/** Reduce an RGBA raster to a palette + per-pixel indices. */
export function quantizeColors(rgba: Uint8Array, maxColors = 256): Quantized {
  const map = new Map<number, Entry>();
  const px = rgba.length >> 2;
  for (let p = 0; p < px; p++) {
    const r = rgba[p * 4]!;
    const g = rgba[p * 4 + 1]!;
    const b = rgba[p * 4 + 2]!;
    const a = rgba[p * 4 + 3]!;
    const key = ((r * 256 + g) * 256 + b) * 256 + a;
    let e = map.get(key);
    if (!e) {
      e = { r, g, b, a, count: 0, key, pi: 0 };
      map.set(key, e);
    }
    e.count++;
  }
  const entries = [...map.values()];
  let palette: [number, number, number, number][];
  if (entries.length <= maxColors) {
    // Exact, lossless palette.
    entries.forEach((e, i) => (e.pi = i));
    palette = entries.map((e) => [e.r, e.g, e.b, e.a]);
  } else {
    const boxes = medianCut(entries, maxColors);
    palette = boxes.map((box, i) => {
      let r = 0, g = 0, b = 0, a = 0, w = 0;
      for (const e of box) {
        r += e.r * e.count;
        g += e.g * e.count;
        b += e.b * e.count;
        a += e.a * e.count;
        w += e.count;
        e.pi = i;
      }
      return [Math.round(r / w), Math.round(g / w), Math.round(b / w), Math.round(a / w)];
    });
  }

  const indices = new Uint8Array(px);
  for (let p = 0; p < px; p++) {
    const r = rgba[p * 4]!;
    const g = rgba[p * 4 + 1]!;
    const b = rgba[p * 4 + 2]!;
    const a = rgba[p * 4 + 3]!;
    const key = ((r * 256 + g) * 256 + b) * 256 + a;
    indices[p] = map.get(key)!.pi;
  }
  return { palette, indices };
}

/**
 * Encode an image as an 8-bit indexed (colour-type 3) PNG. Palette entries are
 * ordered so every non-opaque colour comes first, keeping the tRNS chunk small.
 */
export function encodePngIndexed(img: ImageData, maxColors = 256): Uint8Array {
  const { width, height, rgba } = img;
  if (rgba.length !== width * height * 4) {
    throw new Error("encodePngIndexed: rgba length does not match width * height * 4.");
  }
  const { palette, indices } = quantizeColors(rgba, maxColors);

  // Sort palette so alpha < 255 entries come first (compact tRNS), remap indices.
  const order = palette.map((_, i) => i).sort((a, b) => palette[a]![3] - palette[b]![3]);
  const remap = new Uint8Array(palette.length);
  order.forEach((oldIdx, newIdx) => (remap[oldIdx] = newIdx));
  const sorted = order.map((i) => palette[i]!);
  const idx = new Uint8Array(indices.length);
  for (let i = 0; i < indices.length; i++) idx[i] = remap[indices[i]!]!;

  // PLTE + tRNS.
  const plte = new Uint8Array(sorted.length * 3);
  for (let i = 0; i < sorted.length; i++) {
    plte[i * 3] = sorted[i]![0];
    plte[i * 3 + 1] = sorted[i]![1];
    plte[i * 3 + 2] = sorted[i]![2];
  }
  let trnsLen = 0;
  for (let i = 0; i < sorted.length; i++) if (sorted[i]![3] < 255) trnsLen = i + 1;
  const trns = new Uint8Array(trnsLen);
  for (let i = 0; i < trnsLen; i++) trns[i] = sorted[i]![3];

  // IDAT: one filter byte (None) + one index byte per pixel, per row.
  const raw = new Uint8Array(height * (width + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    raw.set(idx.subarray(y * width, y * width + width), y * (width + 1) + 1);
  }
  const compressed = new Uint8Array(deflateSync(raw, { level: 9 }));

  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, width);
  iv.setUint32(4, height);
  ihdr[8] = 8; // bit depth (8-bit indices)
  ihdr[9] = 3; // colour type: indexed
  const chunks: Uint8Array[] = [
    PNG_SIGNATURE,
    writeChunk("IHDR", ihdr),
    writeChunk("PLTE", plte),
  ];
  if (trnsLen > 0) chunks.push(writeChunk("tRNS", trns));
  chunks.push(writeChunk("IDAT", compressed), writeChunk("IEND", new Uint8Array(0)));

  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}
