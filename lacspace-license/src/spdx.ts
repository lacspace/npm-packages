import { LICENSE_TEXTS } from "./licenses.js";

/** Broad category of a licence's obligations. */
export type LicenseCategory = "permissive" | "copyleft" | "weak-copyleft" | "public-domain";

/** Static metadata about a supported SPDX licence. */
export interface LicenseMeta {
  /** SPDX identifier (canonical), e.g. "MIT", "Apache-2.0". */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Obligation category. */
  category: LicenseCategory;
  /** Whether this licence conventionally wants a short per-file header notice. */
  needsHeader: boolean;
  /** Whether the template body contains fillable {{year}}/{{holder}} placeholders. */
  hasFields: boolean;
}

/**
 * The supported licences, keyed by canonical SPDX id. The `LacspaceFree-1.0`
 * key maps to the Lacspace Free Licence v1.0 (a permissive, source-available
 * licence). All texts live in `licenses.ts`.
 */
export const LICENSE_META: Record<string, LicenseMeta> = {
  "MIT": { id: "MIT", name: "MIT License", category: "permissive", needsHeader: false, hasFields: true },
  "Apache-2.0": { id: "Apache-2.0", name: "Apache License 2.0", category: "permissive", needsHeader: true, hasFields: true },
  "BSD-2-Clause": { id: "BSD-2-Clause", name: "BSD 2-Clause \"Simplified\" License", category: "permissive", needsHeader: false, hasFields: true },
  "BSD-3-Clause": { id: "BSD-3-Clause", name: "BSD 3-Clause \"New\" or \"Revised\" License", category: "permissive", needsHeader: false, hasFields: true },
  "ISC": { id: "ISC", name: "ISC License", category: "permissive", needsHeader: false, hasFields: true },
  "MPL-2.0": { id: "MPL-2.0", name: "Mozilla Public License 2.0", category: "weak-copyleft", needsHeader: true, hasFields: false },
  "GPL-3.0-only": { id: "GPL-3.0-only", name: "GNU General Public License v3.0 only", category: "copyleft", needsHeader: true, hasFields: false },
  "AGPL-3.0-only": { id: "AGPL-3.0-only", name: "GNU Affero General Public License v3.0 only", category: "copyleft", needsHeader: true, hasFields: false },
  "LGPL-3.0-only": { id: "LGPL-3.0-only", name: "GNU Lesser General Public License v3.0 only", category: "weak-copyleft", needsHeader: true, hasFields: false },
  "Unlicense": { id: "Unlicense", name: "The Unlicense", category: "public-domain", needsHeader: false, hasFields: false },
  "CC0-1.0": { id: "CC0-1.0", name: "Creative Commons Zero v1.0 Universal", category: "public-domain", needsHeader: false, hasFields: false },
  "LacspaceFree-1.0": { id: "LacspaceFree-1.0", name: "Lacspace Free Licence v1.0", category: "permissive", needsHeader: false, hasFields: true },
};

/**
 * Deprecated / alternate SPDX ids and common aliases mapped to the canonical
 * id we store. Lets `check` and `init` accept e.g. "GPL-3.0" or "apache2".
 */
export const LICENSE_ALIASES: Record<string, string> = {
  "gpl-3.0": "GPL-3.0-only",
  "gpl-3.0-or-later": "GPL-3.0-only",
  "gplv3": "GPL-3.0-only",
  "agpl-3.0": "AGPL-3.0-only",
  "agpl-3.0-or-later": "AGPL-3.0-only",
  "lgpl-3.0": "LGPL-3.0-only",
  "lgpl-3.0-or-later": "LGPL-3.0-only",
  "apache2": "Apache-2.0",
  "apache-2": "Apache-2.0",
  "apache": "Apache-2.0",
  "bsd-2": "BSD-2-Clause",
  "bsd2": "BSD-2-Clause",
  "freebsd": "BSD-2-Clause",
  "bsd-3": "BSD-3-Clause",
  "bsd3": "BSD-3-Clause",
  "bsd": "BSD-3-Clause",
  "newbsd": "BSD-3-Clause",
  "mpl": "MPL-2.0",
  "mpl2": "MPL-2.0",
  "cc0": "CC0-1.0",
  "cc0-1.0-universal": "CC0-1.0",
  "unlicensed": "Unlicense",
  "lacspace": "LacspaceFree-1.0",
  "lacspace-free": "LacspaceFree-1.0",
  "lacspacefree": "LacspaceFree-1.0",
  "lacspace-free-1.0": "LacspaceFree-1.0",
};

/** Every supported canonical id. */
export function supportedIds(): string[] {
  return Object.keys(LICENSE_META);
}

/**
 * Resolve a user-supplied licence id to a canonical supported id, or `null`
 * if unknown. Case-insensitive; understands aliases and deprecated ids.
 */
export function resolveId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  // exact canonical
  if (LICENSE_META[raw]) return raw;
  const lower = raw.toLowerCase();
  // case-insensitive canonical match
  for (const id of Object.keys(LICENSE_META)) {
    if (id.toLowerCase() === lower) return id;
  }
  if (LICENSE_ALIASES[lower]) return LICENSE_ALIASES[lower];
  return null;
}

/** Look up metadata for a canonical id (throws if unsupported). */
export function metaOf(id: string): LicenseMeta {
  const canon = resolveId(id);
  if (!canon) throw new Error(`Unsupported SPDX id: "${id}". Run \`list\` to see supported ids.`);
  return LICENSE_META[canon]!;
}

/** Raw template text (with {{year}}/{{holder}} placeholders) for an id. */
export function templateOf(id: string): string {
  const canon = resolveId(id);
  if (!canon) throw new Error(`Unsupported SPDX id: "${id}". Run \`list\` to see supported ids.`);
  const text = LICENSE_TEXTS[canon];
  if (text === undefined) throw new Error(`No embedded text for "${canon}".`);
  return text;
}
