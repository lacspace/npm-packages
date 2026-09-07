import { LICENSE_META, resolveId } from "./spdx.js";
import type { LicenseCategory } from "./spdx.js";

/** Verdict for a single project↔dependency licence pairing. */
export type CompatVerdict = "compatible" | "incompatible" | "review" | "unknown";

/** One dependency's compatibility outcome against the project licence. */
export interface CompatIssue {
  /** The dependency licence id, as supplied. */
  dep: string;
  /** Canonical dependency id, or the raw input when unresolvable. */
  canonical: string;
  verdict: CompatVerdict;
  /** Plain-language explanation of the verdict. */
  reason: string;
}

/** The full result of a compatibility check. */
export interface CompatResult {
  /** Canonical project licence id (or the raw input if unresolvable). */
  project: string;
  /** True when no dependency is outright incompatible. */
  ok: boolean;
  /** One entry per dependency licence, in input order. */
  issues: CompatIssue[];
  /** Dep ids flagged `incompatible`. */
  incompatible: string[];
  /** Dep ids flagged `review` (allowed with care / conditions). */
  review: string[];
  /** Dep ids we could not classify (`unknown`). */
  unknown: string[];
}

function categoryOf(id: string): LicenseCategory | null {
  const canon = resolveId(id);
  if (!canon) return null;
  return LICENSE_META[canon]?.category ?? null;
}

function isAgpl(canon: string): boolean {
  return /^AGPL/i.test(canon);
}
function isGplFamily(canon: string): boolean {
  return /^A?GPL/i.test(canon);
}

/**
 * Decide whether a dependency licence may be combined into, and redistributed
 * as part of, a work released under the project licence. This is a conservative,
 * outbound-direction model (dep → project), the direction that matters when you
 * ship a product: a strong-copyleft dependency in a permissively-licensed
 * product is the classic violation.
 */
export function verdictFor(projectSpdx: string, depSpdx: string): CompatIssue {
  const projCanon = resolveId(projectSpdx) ?? projectSpdx;
  const depCanon = resolveId(depSpdx) ?? depSpdx;
  const pCat = categoryOf(projectSpdx);
  const dCat = categoryOf(depSpdx);

  const base = (verdict: CompatVerdict, reason: string): CompatIssue => ({
    dep: depSpdx,
    canonical: depCanon,
    verdict,
    reason,
  });

  if (!pCat) return base("unknown", `Project licence "${projectSpdx}" is not recognised — cannot assess.`);
  if (!dCat) return base("unknown", `Dependency licence "${depSpdx}" is not recognised — assess manually.`);

  // Identical licences are always fine.
  if (projCanon.toLowerCase() === depCanon.toLowerCase()) {
    return base("compatible", `Same licence as the project (${projCanon}).`);
  }

  // Public-domain / permissive dependencies drop into anything.
  if (dCat === "public-domain") {
    return base("compatible", `${depCanon} is public-domain-equivalent — includable anywhere.`);
  }
  if (dCat === "permissive") {
    return base("compatible", `${depCanon} is permissive — safe to include and redistribute under ${projCanon}.`);
  }

  // Weak-copyleft dependency (LGPL-3.0, MPL-2.0).
  if (dCat === "weak-copyleft") {
    if (pCat === "copyleft" || pCat === "weak-copyleft") {
      return base("compatible", `${depCanon} (weak copyleft) is absorbable into a ${projCanon} work.`);
    }
    return base(
      "review",
      `${depCanon} is weak copyleft — fine to link, but keep it as a separate/dynamically-linked ` +
        `library and don't merge its source into your ${projCanon} code.`,
    );
  }

  // Strong-copyleft dependency (GPL-3.0, AGPL-3.0).
  if (dCat === "copyleft") {
    if (pCat === "copyleft") {
      // GPL/AGPL family combinations.
      if (isAgpl(depCanon) && isGplFamily(projCanon) && !isAgpl(projCanon)) {
        return base(
          "review",
          `${depCanon} is stronger than ${projCanon}: the combined, network-served work must be ` +
            `offered under AGPL, not just ${projCanon}.`,
        );
      }
      return base("compatible", `${depCanon} combines with the copyleft project licence ${projCanon}.`);
    }
    return base(
      "incompatible",
      `${depCanon} is strong copyleft — including it forces the whole combined work under ${depCanon}; ` +
        `it cannot be redistributed under ${projCanon}.`,
    );
  }

  return base("unknown", `Could not classify ${depCanon} against ${projCanon}.`);
}

/**
 * Check a project licence against a set of dependency licences and flag
 * incompatible combinations (e.g. a GPL dependency in a permissively-licensed
 * project). Zero network — pure, matrix-driven reasoning over the built-in
 * licence metadata.
 *
 * ```ts
 * const r = checkCompatibility("MIT", ["Apache-2.0", "GPL-3.0-only"]);
 * r.ok;            // false
 * r.incompatible;  // ["GPL-3.0-only"]
 * ```
 */
export function checkCompatibility(projectSpdx: string, depSpdxList: string[]): CompatResult {
  const projCanon = resolveId(projectSpdx) ?? projectSpdx;
  const issues = depSpdxList.map((d) => verdictFor(projectSpdx, d));
  const incompatible = issues.filter((i) => i.verdict === "incompatible").map((i) => i.dep);
  const review = issues.filter((i) => i.verdict === "review").map((i) => i.dep);
  const unknown = issues.filter((i) => i.verdict === "unknown").map((i) => i.dep);
  return {
    project: projCanon,
    ok: incompatible.length === 0,
    issues,
    incompatible,
    review,
    unknown,
  };
}
