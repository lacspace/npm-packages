/**
 * A single explained evaluation → `{ enabled, variant?, reason }`. Same answer
 * as `isEnabled` / `variant`, but it also tells you *why* it resolved that way,
 * which is what you want in a debug panel, an audit log, or a QA preview.
 *
 * Deterministic decision order:
 *   override (ctx.overrides) → kill-switch (enabled:false) → targeting (rules)
 *   → percentage rollout → default.
 */

import type { BooleanFlag, Context, FlagDef, Rule, VariantFlag } from "./index";
import { isEnabled, isVariantFlag, matchCondition, variant } from "./index";

/** Why a flag resolved the way it did. */
export type EvalReason =
  | "override" // forced by ctx.overrides
  | "kill-switch" // flag globally off (enabled:false)
  | "targeting" // a targeting rule matched
  | "rollout" // decided by a percentage / weighted bucket
  | "default" // fell through to the flag default (fully on/off, no rule)
  | "unknown"; // no such flag

export interface Evaluation {
  enabled: boolean;
  /** Present for variant flags (and string overrides). */
  variant?: string;
  reason: EvalReason;
}

/** Find the first rule whose conditions match the context, if any. */
function firstMatch(rules: Rule[] | undefined, ctx: Context): Rule | undefined {
  for (const rule of rules ?? []) {
    if (matchCondition(ctx.attributes ?? {}, rule.when)) return rule;
  }
  return undefined;
}

function explainVariant(flagKey: string, def: VariantFlag, ctx: Context): Evaluation {
  const fallback = def.default ?? def.variants[0]?.key ?? "";
  if (def.enabled === false) return { enabled: false, variant: fallback, reason: "kill-switch" };
  const matched = firstMatch(def.rules, ctx);
  if (matched && typeof matched.value === "string") {
    return { enabled: true, variant: matched.value, reason: "targeting" };
  }
  // weighted split (a matched rule with no explicit variant also lands here)
  return { enabled: true, variant: variant(flagKey, def, ctx), reason: "rollout" };
}

function explainBoolean(flagKey: string, def: BooleanFlag, ctx: Context): Evaluation {
  const fallback = def.default ?? false;
  if (def.enabled === false) return { enabled: fallback, reason: "kill-switch" };
  const value = isEnabled(flagKey, def, ctx);
  const matched = firstMatch(def.rules, ctx);
  if (matched) {
    const reason: EvalReason = typeof matched.rollout === "number" && typeof matched.value !== "boolean" ? "rollout" : "targeting";
    return { enabled: value, reason };
  }
  const rollout = def.rollout ?? (def.rules && def.rules.length ? 0 : 100);
  const reason: EvalReason = rollout >= 100 || rollout <= 0 ? "default" : "rollout";
  return { enabled: value, reason };
}

/**
 * Explain how `def` resolves for `ctx`. Checks `ctx.overrides[flagKey]` first
 * (a boolean forces on/off, a string forces a variant), then the flag's own
 * kill-switch → targeting → rollout → default chain. Unknown flag → `unknown`.
 */
export function explain(def: FlagDef | undefined, flagKey: string, ctx: Context): Evaluation {
  const forced = ctx.overrides?.[flagKey];
  if (forced !== undefined) {
    return typeof forced === "string"
      ? { enabled: true, variant: forced, reason: "override" }
      : { enabled: forced, reason: "override" };
  }
  if (!def) return { enabled: false, reason: "unknown" };
  return isVariantFlag(def) ? explainVariant(flagKey, def, ctx) : explainBoolean(flagKey, def, ctx);
}
