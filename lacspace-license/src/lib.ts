/**
 * lacspace-license — a keyless, zero-dependency licence manager for a codebase.
 * Generate a LICENSE from an SPDX id (author/year/holder filled in), add or
 * refresh per-file licence headers with the right comment syntax per language,
 * build a THIRD-PARTY-NOTICES file from your installed dependencies, and gate
 * CI that a LICENSE exists, matches package.json, and that sources carry a
 * header. Where lacspace-deps *audits* licences, this one *creates and manages*
 * them. Zero runtime dependencies — Node built-ins only.
 *
 * ```ts
 * import { generateLicense, addHeader, styleForFile, checkProject } from "lacspace-license";
 *
 * // 1. Generate a filled LICENSE
 * generateLicense("MIT", { author: "Lacspace", year: 2026 }).text;
 *
 * // 2. Add an idempotent SPDX header to a source file
 * const style = styleForFile("src/index.ts")!;      // { kind: "line", token: "//" }
 * addHeader(source, style, { id: "MIT", year: 2026, holder: "Lacspace" });
 *
 * // 3. CI gate
 * const r = checkProject({ requireHeaders: true });
 * if (!r.ok) process.exit(1);
 * ```
 *
 * Embedded licences: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, MPL-2.0,
 * GPL-3.0-only, AGPL-3.0-only, LGPL-3.0-only, Unlicense, CC0-1.0 and the
 * Lacspace Free Licence v1.0 (`LacspaceFree-1.0`).
 */

export {
  LICENSE_META,
  LICENSE_ALIASES,
  supportedIds,
  resolveId,
  metaOf,
  templateOf,
} from "./spdx.js";
export type { LicenseMeta, LicenseCategory } from "./spdx.js";

export { LICENSE_TEXTS } from "./licenses.js";

export { generateLicense, fillTemplate } from "./generate.js";
export type { FillFields, GeneratedLicense } from "./generate.js";

export {
  styleForFile,
  buildHeader,
  findHeader,
  hasHeader,
  addHeader,
  updateHeader,
  removeHeader,
  DEFAULT_HEADER_TEMPLATE,
} from "./headers.js";
export type { CommentStyle, HeaderFields, HeaderResult } from "./headers.js";

export {
  detectLicense,
  detectLicenseInfo,
  detectMatches,
  licenseMatches,
  sameLicense,
  normalizeLicenseText,
} from "./detect.js";
export type { DetectMatch, DetectInfo } from "./detect.js";

export { checkCompatibility, verdictFor } from "./compat.js";
export type { CompatResult, CompatIssue, CompatVerdict } from "./compat.js";

export {
  scanDependencies,
  groupByLicense,
  renderNotices,
} from "./notices.js";
export type { DependencyNotice, NoticesOptions, NoticesFormat } from "./notices.js";

export { checkProject } from "./check.js";
export type { CheckResult, CheckIssue, CheckOptions } from "./check.js";

export {
  findPackageJson,
  readPackageJson,
  findLicenseFile,
  authorName,
  licenseId,
  expandGlobs,
} from "./pkg.js";
export type { PackageInfo } from "./pkg.js";
