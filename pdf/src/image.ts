/**
 * Zero-dependency raster image embedding for PDFs.
 *
 * - **JPEG** is embedded directly (the PDF `DCTDecode` filter *is* JPEG), so the
 *   raw bytes are copied in with no decoding — works in Node, edge and the
 *   browser.
 * - **Raw pixels** (pre-decoded RGB / grayscale / CMYK) are embedded uncompressed.
 *
 * PNG is intentionally not decoded here — that needs a zlib inflater plus PNG
 * filter reconstruction, which would break the zero-dependency promise. Decode a
 * PNG with the platform (e.g. `sharp`, `canvas`, `createImageBitmap`) and pass
 * the resulting pixels to {@link rgbImage}.
 */

export type ImageColorSpace = "DeviceRGB" | "DeviceGray" | "DeviceCMYK";

/** A parsed image ready to be embedded as a PDF XObject. */
export interface EmbeddedImage {
  /** `"jpeg"` embeds bytes via DCTDecode; `"rgb"` embeds raw uncompressed samples. */
  kind: "jpeg" | "rgb";
  /** The bytes written into the image stream. */
  data: Uint8Array;
  /** Pixel width. */
  width: number;
  /** Pixel height. */
  height: number;
  /** PDF colour space. */
  colorSpace: ImageColorSpace;
  /** Bits per component (JPEG precision, or 8 for raw pixels). */
  bits: number;
}

const channelsFor = (cs: ImageColorSpace): number => (cs === "DeviceGray" ? 1 : cs === "DeviceCMYK" ? 4 : 3);

/**
 * Parse a JPEG's dimensions/colour space from its SOF marker and return it
 * ready to embed (the original bytes are kept and streamed with `DCTDecode`).
 *
 * @throws if the bytes are not a JPEG or contain no start-of-frame marker.
 */
export function jpegImage(bytes: Uint8Array): EmbeddedImage {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error("jpegImage: not a JPEG (missing SOI marker 0xFFD8)");
  }
  let i = 2;
  while (i < bytes.length - 1) {
    if (bytes[i] !== 0xff) { i++; continue; }
    let marker = bytes[i + 1]!;
    // Skip any fill bytes (0xFF padding between markers).
    while (marker === 0xff && i < bytes.length - 1) { i++; marker = bytes[i + 1]!; }
    i += 2;
    if (marker === 0xd8 || marker === 0xd9) break;                 // SOI / EOI
    if (marker >= 0xd0 && marker <= 0xd7) continue;                // RSTn — no length
    if (marker === 0x01) continue;                                 // TEM — no length
    if (i + 1 >= bytes.length) break;
    const len = (bytes[i]! << 8) | bytes[i + 1]!;
    // Start-of-frame markers carry the geometry (all SOFn except DHT/JPG/DAC).
    const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) {
      const precision = bytes[i + 2]!;
      const height = (bytes[i + 3]! << 8) | bytes[i + 4]!;
      const width = (bytes[i + 5]! << 8) | bytes[i + 6]!;
      const comps = bytes[i + 7]!;
      const colorSpace: ImageColorSpace = comps === 1 ? "DeviceGray" : comps === 4 ? "DeviceCMYK" : "DeviceRGB";
      return { kind: "jpeg", data: bytes, width, height, colorSpace, bits: precision };
    }
    i += len;
  }
  throw new Error("jpegImage: no start-of-frame (SOF) marker found — not a baseline/progressive JPEG?");
}

/**
 * Embed pre-decoded raw pixel samples (uncompressed). `data` must be exactly
 * `width * height * channels` bytes, where channels is 3 (RGB, default), 1
 * (grayscale) or 4 (CMYK).
 *
 * @throws if `data` is not the expected length.
 */
export function rgbImage(opts: {
  data: Uint8Array;
  width: number;
  height: number;
  colorSpace?: ImageColorSpace;
}): EmbeddedImage {
  const colorSpace = opts.colorSpace ?? "DeviceRGB";
  const expected = opts.width * opts.height * channelsFor(colorSpace);
  if (opts.data.length !== expected) {
    throw new Error(`rgbImage: data length ${opts.data.length} does not match ${opts.width}×${opts.height}×${channelsFor(colorSpace)} = ${expected}`);
  }
  return { kind: "rgb", data: opts.data, width: opts.width, height: opts.height, colorSpace, bits: 8 };
}
