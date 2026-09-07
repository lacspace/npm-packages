/**
 * lacspace-qr — a keyless, zero-dependency QR-code generator. A spec-correct QR
 * encoder (byte / numeric / alphanumeric modes, Reed–Solomon ECC over GF(256),
 * automatic version and mask selection) plus three hand-written renderers
 * (terminal half-blocks, SVG, and a PNG encoder built on `node:zlib`) and ready
 * -made payload builders for URL, WiFi, vCard, email, phone, SMS and geo.
 *
 * ```ts
 * import { makeQr, renderToSvg, renderToTerminal, wifiPayload } from "lacspace-qr";
 *
 * const qr = makeQr("https://lacspace.com", { ecc: "M" });
 * console.log(renderToTerminal(qr));           // scannable off the screen
 * const svg = renderToSvg(qr, { size: 512 });  // crisp vector output
 *
 * // A WiFi-join QR:
 * const wifi = makeQr(wifiPayload({ ssid: "Lacspace", password: "s3cret" }));
 * ```
 *
 * Everything is isomorphic and offline: the terminal and SVG renderers are pure,
 * and the PNG encoder only needs `node:zlib`. No network, no telemetry.
 */

export { makeQr } from "./matrix.js";
export type { QrCode, QrOptions } from "./matrix.js";

export {
  encodeText,
  addEccAndInterleave,
  selectMode,
  selectVersion,
  charCountBits,
  dataBitLength,
  totalBits,
  isNumeric,
  isAlphanumeric,
  BitBuffer,
  ALPHANUMERIC_CHARSET,
} from "./encode.js";
export type { QrMode, EncodeOptions, EncodedData } from "./encode.js";

export {
  ECC_LEVELS,
  versionSize,
  numRawDataModules,
  numRawCodewords,
  numDataCodewords,
  dataCapacityBits,
  alignmentPatternPositions,
  MIN_VERSION,
  MAX_VERSION,
} from "./tables.js";
export type { EccLevel } from "./tables.js";

export { gfMul, gfExp, gfLog, gfPow, rsComputeDivisor, rsComputeRemainder, GF_PRIMITIVE } from "./gf.js";

export { renderToTerminal } from "./terminal.js";
export type { TerminalOptions } from "./terminal.js";
export { renderToAnsi } from "./ansi.js";
export type { AnsiOptions } from "./ansi.js";
export { renderToSvg, isFinderModule, logoClearing } from "./svg.js";
export type { SvgOptions, Gradient, ModuleShape, LogoOptions, LogoClearing } from "./svg.js";
export { renderToPng, renderToImage, encodePng, isPng, crc32 } from "./png.js";
export type { PngOptions, ImageData } from "./png.js";

export {
  wifiPayload,
  vcardPayload,
  emailPayload,
  telPayload,
  smsPayload,
  geoPayload,
  urlPayload,
  calendarPayload,
  escapeWifi,
  escapeVcard,
  escapeIcs,
} from "./payloads.js";
export type {
  WifiPayload,
  VcardPayload,
  EmailPayload,
  SmsPayload,
  CalendarPayload,
} from "./payloads.js";

export { parseColor, toCss } from "./color.js";
export type { Rgba } from "./color.js";

export { parseBatch, parseCsvLine, safeFilename, planBatch } from "./batch.js";
export type { BatchRow, BatchPlan } from "./batch.js";
