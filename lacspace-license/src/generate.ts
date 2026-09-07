import { metaOf, templateOf } from "./spdx.js";

/** Fields used to fill a licence template's placeholders. */
export interface FillFields {
  /** Copyright year (or range like "2023-2026"). Defaults to the current year. */
  year?: string | number;
  /** Copyright holder / owner shown on the copyright line. */
  holder?: string;
}

/** Result of generating a filled LICENSE. */
export interface GeneratedLicense {
  /** Canonical SPDX id. */
  id: string;
  /** Human-readable licence name. */
  name: string;
  /** The filled licence text (placeholders replaced), ending with a newline. */
  text: string;
  /** Whether the template had fillable {{year}}/{{holder}} placeholders. */
  filled: boolean;
}

/**
 * Fill a raw template string's `{{year}}` / `{{holder}}` placeholders. Exposed
 * for headers and tests. Missing fields default to the current year and a
 * neutral holder placeholder.
 */
export function fillTemplate(template: string, fields: FillFields = {}): string {
  const year = fields.year !== undefined && String(fields.year).trim() !== ""
    ? String(fields.year).trim()
    : String(new Date().getFullYear());
  const holder = fields.holder !== undefined && fields.holder.trim() !== ""
    ? fields.holder.trim()
    : "<name of copyright holder>";
  return template
    .replace(/\{\{\s*year\s*\}\}/g, year)
    .replace(/\{\{\s*holder\s*\}\}/g, holder);
}

/**
 * Generate a complete, filled LICENSE for a supported SPDX id.
 *
 * ```ts
 * generateLicense("MIT", { author: "Lacspace", year: 2026 }).text;
 * ```
 */
export function generateLicense(id: string, fields: FillFields = {}): GeneratedLicense {
  const meta = metaOf(id);
  const template = templateOf(id);
  const text = fillTemplate(template, fields);
  return { id: meta.id, name: meta.name, text, filled: meta.hasFields };
}
