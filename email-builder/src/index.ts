/**
 * @lacspace/email-builder — block JSON → bulletproof, table-based, responsive
 * email HTML (Outlook/Gmail/Apple Mail/mobile) + plain text. Zero dependencies,
 * isomorphic.
 */

export { render, DEFAULT_FONT, DEFAULT_WIDTH, SIZE_WARN_BYTES } from "./render";
export { validate } from "./validate";
export { blockSchema, defaultBrand } from "./schema";
export { starterTemplates } from "./starters";
export { sanitizeRichText, htmlToText, ALLOWED_TAGS } from "./sanitize";
export { escapeHtml, escapeAttr, isSafeUrl, VAR_RE } from "./escape";
export { contrastRatio, parseColor, isColor, toHex, luminance } from "./color";
export { blockToText, docToText } from "./text";
export type {
  Block,
  BlockType,
  BlockSpec,
  Brand,
  EmailDoc,
  PropSpec,
  PropType,
  RenderOptions,
  RenderResult,
  StarterCategory,
  StarterTemplate,
  ValidationError,
  ValidationResult,
} from "./types";
export type { SanitizeOptions } from "./sanitize";
export type { RGB } from "./color";
