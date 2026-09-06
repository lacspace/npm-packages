/**
 * Build a Windows .ico file that embeds PNG images. Modern browsers and
 * Windows both understand PNG-in-ICO, so we skip the legacy BMP/DIB encoding
 * entirely: an ICONDIR header, one ICONDIRENTRY per image, then the raw PNG
 * bytes appended in order.
 */

/** One image to embed in the .ico: its PNG bytes and its (square) pixel size. */
export interface IcoEntry {
  png: Uint8Array;
  size: number;
}

/** Assemble an .ico from one or more PNG images (e.g. 16, 32, 48). */
export function makeIco(entries: IcoEntry[]): Uint8Array {
  if (entries.length === 0) throw new Error("makeIco: need at least one image.");
  const count = entries.length;
  const headerSize = 6 + count * 16;
  let total = headerSize;
  for (const e of entries) total += e.png.length;

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  // ICONDIR
  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: 1 = icon
  view.setUint16(4, count, true); // image count

  let offset = headerSize;
  for (let i = 0; i < count; i++) {
    const e = entries[i]!;
    const entryPos = 6 + i * 16;
    // Width/height: 0 means 256.
    out[entryPos] = e.size >= 256 ? 0 : e.size;
    out[entryPos + 1] = e.size >= 256 ? 0 : e.size;
    out[entryPos + 2] = 0; // colour palette count
    out[entryPos + 3] = 0; // reserved
    view.setUint16(entryPos + 4, 1, true); // colour planes
    view.setUint16(entryPos + 6, 32, true); // bits per pixel
    view.setUint32(entryPos + 8, e.png.length, true); // bytes in resource
    view.setUint32(entryPos + 12, offset, true); // offset of image data
    out.set(e.png, offset);
    offset += e.png.length;
  }

  return out;
}
