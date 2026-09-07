/**
 * lacspace-deps — a keyless dependency & licence auditor for any Node/JS
 * project. Reads `package.json`, the lockfile and the local `node_modules` and
 * reports supply-chain hygiene: licences (with allow/deny policy), install
 * size, duplicate versions, unused & missing dependencies, and (opt-in,
 * online) outdated packages. Everything except the outdated check is fully
 * offline. Zero runtime dependencies — only Node built-ins.
 *
 * ```ts
 * import { audit } from "lacspace-deps";
 *
 * const report = await audit(".", {
 *   policy: { allow: ["MIT", "ISC", "Apache-2.0", "BSD-*"], deny: ["GPL-*", "AGPL-*"] },
 * });
 *
 * report.health;                 // 0-100 hygiene score
 * report.licenses.violations;    // packages that hit the policy
 * report.usage.unused;           // declared-but-never-imported deps
 * report.usage.missing;          // imported-but-undeclared deps
 * report.duplicates;             // packages installed at >1 version
 * report.size.totalBytes;        // total install size on disk
 * ```
 *
 * Or use the focused building blocks directly — `buildInventory`,
 * `summarizeLicenses`, `measureSizes`, `findDuplicates`, `analyzeUsage`,
 * `checkOutdated` — each is pure aside from the fs reads it needs (and the
 * registry calls `checkOutdated` makes).
 */
export {
  buildInventory,
  detectLockfile,
  collectDeclared,
  normalizeLicense,
  readJson,
  scanNodeModules,
  parseYarnLockDirect,
  parsePnpmLockDirect,
} from "./inventory.js";
export type {
  Inventory,
  InventoryOptions,
  InstalledPackage,
  DeclaredDep,
  DepType,
  LockfileType,
} from "./inventory.js";

export {
  summarizeLicenses,
  classifyLicense,
  evaluatePolicy,
  licenseMatches,
  patternToRegExp,
  splitExpression,
  severityRank,
  SEVERITY_ORDER,
} from "./licenses.js";
export type {
  LicenseCategory,
  LicenseEntry,
  LicenseViolation,
  LicenseSummary,
  LicensePolicy,
} from "./licenses.js";

export {
  normalizeConfig,
  mergeConfig,
  configToPolicy,
  configToAuditOptions,
  findConfigPath,
  loadConfig,
  CONFIG_FILENAMES,
} from "./policy.js";
export type { DepsConfig } from "./policy.js";

export {
  buildSbom,
  buildCycloneDx,
  buildSpdx,
  componentsFromInventory,
  componentsFromInstalled,
  componentsFromDeclared,
  purlFor,
  spdxId,
  TOOL_NAME,
  TOOL_VERSION,
  TOOL_VENDOR,
} from "./sbom.js";
export type {
  SbomFormat,
  SbomComponent,
  SbomMeta,
  SbomOptions,
  CycloneDxDocument,
  CycloneDxComponent,
  SpdxDocument,
  SpdxPackage,
  SpdxRelationship,
} from "./sbom.js";

export { measureSizes, dirSize, formatBytes } from "./size.js";
export type { SizeEntry, SizeReport, SizeOptions } from "./size.js";

export { findDuplicates, compareVersions } from "./duplicates.js";
export type { DuplicateEntry } from "./duplicates.js";

export {
  analyzeUsage,
  scanImports,
  listSourceFiles,
  extractSpecifiers,
  specifierToPackage,
  IMPLICIT_TOOLING,
} from "./usage.js";
export type { UsageScan, UsageReport, UsageOptions } from "./usage.js";

export {
  checkOutdated,
  fetchLatest,
  parseSemver,
  diffLevel,
} from "./outdated.js";
export type {
  OutdatedLevel,
  OutdatedEntry,
  OutdatedReport,
  OutdatedOptions,
  FetchLike,
} from "./outdated.js";

export { audit, healthScore, shouldFail } from "./audit.js";
export type { AuditReport, AuditOptions, FailOn } from "./audit.js";

export {
  renderHuman,
  renderMarkdown,
  makeColor,
} from "./format.js";
export type { Colorize, ColorKey } from "./format.js";
