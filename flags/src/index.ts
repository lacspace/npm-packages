/**
 * @lacspace/flags
 *
 * Feature flags & A/B experiments with **no SaaS and no infrastructure**.
 * You own the config (a plain object — from JSON, env, a DB row, anywhere);
 * this evaluates it. The whole space is hosted vendors (LaunchDarkly, Optimizely,
 * Unleash) — this is the tiny, self-hosted primitive for the rest of us.
 *
 * - Deterministic bucketing — the same user ALWAYS gets the same result
 *   (stable percentage rollouts & A/B assignment, no flicker, works offline)
 * - Targeting rules on user attributes (eq / in / gt / contains / regex …)
 * - Boolean flags AND weighted multivariate experiments
 * - Synchronous, zero-dependency, isomorphic — evaluate flags right in render
 */

export type AttrValue = string | number | boolean | null | undefined;
export type Attributes = Record<string, AttrValue>;

export interface Context {
  /** Stable identifier the bucketing is keyed on (user id, account id, device id). */
  key: string;
  /** Attributes used by targeting rules. */
  attributes?: Attributes;
}

/* ------------------------------ conditions ------------------------------ */

export interface Operator {
  eq?: AttrValue;
  ne?: AttrValue;
  in?: AttrValue[];
  nin?: AttrValue[];
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
  contains?: string;
  regex?: string;
}

/** A set of attribute conditions — ALL must match. */
export type Condition = Record<string, AttrValue | Operator>;

export interface Rule {
  /** Attribute conditions that must all match for this rule to apply. */
  when: Condition;
  /** Force this value (boolean flag) or variant key (variant flag). */
  value?: boolean | string;
  /** Or: percentage rollout within the matched segment (0–100). */
  rollout?: number;
}

export interface Variant {
  key: string;
  /** Relative weight (default 1 → equal split). */
  weight?: number;
}

export interface BooleanFlag {
  type?: "boolean";
  /** Master switch. Default true. */
  enabled?: boolean;
  /** Percentage rollout 0–100 when no rule matches. Default 100. */
  rollout?: number;
  rules?: Rule[];
  /** Value when disabled or outside the rollout. Default false. */
  default?: boolean;
  /** Salt for bucketing (change it to re-shuffle everyone). */
  seed?: string;
}

export interface VariantFlag {
  type: "variant";
  enabled?: boolean;
  variants: Variant[];
  rules?: Rule[];
  /** Fallback variant key when disabled. Default: first variant. */
  default?: string;
  seed?: string;
}

export type FlagDef = BooleanFlag | VariantFlag;

/* ------------------------------ hashing ------------------------------ */

/** FNV-1a 32-bit — fast, deterministic, well-distributed for bucketing. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/** Stable bucket in [0, 1) for a key. */
export function bucket(key: string): number {
  return (fnv1a(key) % 100000) / 100000;
}

/** Canonical bucketing string shared by the rollout decision and the debug helper. */
function rolloutKey(flagKey: string, seed: string, ctx: Context, salt = ""): string {
  return `${flagKey}:${seed}:${salt}:${ctx.key}`;
}

/**
 * Stable 0–100 percentage for a (flag, context) pair — useful for debugging rollouts.
 * Computes the exact same bucket the real rollout decision uses, so it truthfully
 * reports who is in the rollout. Pass the flag's own `seed` (and the rule `salt`,
 * if inspecting a rule rollout) to match a specific decision.
 */
export function percentage(flag: string, ctx: Context, seed = "", salt = ""): number {
  return Math.floor(bucket(rolloutKey(flag, seed, ctx, salt)) * 100);
}

/* ------------------------------ matching ------------------------------ */

function matchOperator(actual: AttrValue, op: Operator): boolean {
  if ("eq" in op && actual !== op.eq) return false;
  if ("ne" in op && actual === op.ne) return false;
  if (op.in && !op.in.includes(actual)) return false;
  if (op.nin && op.nin.includes(actual)) return false;
  if (typeof op.gt === "number" && !(typeof actual === "number" && actual > op.gt)) return false;
  if (typeof op.gte === "number" && !(typeof actual === "number" && actual >= op.gte)) return false;
  if (typeof op.lt === "number" && !(typeof actual === "number" && actual < op.lt)) return false;
  if (typeof op.lte === "number" && !(typeof actual === "number" && actual <= op.lte)) return false;
  if (typeof op.contains === "string" && !(typeof actual === "string" && actual.includes(op.contains))) return false;
  if (typeof op.regex === "string" && !(typeof actual === "string" && new RegExp(op.regex).test(actual))) return false;
  return true;
}

function matchCondition(attrs: Attributes, cond: Condition): boolean {
  for (const [field, expected] of Object.entries(cond)) {
    const actual = attrs[field];
    if (expected !== null && typeof expected === "object" && !Array.isArray(expected)) {
      if (!matchOperator(actual, expected)) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

/* ------------------------------ evaluation ------------------------------ */

function inRollout(flagKey: string, seed: string, ctx: Context, rollout: number, salt = ""): boolean {
  if (rollout >= 100) return true;
  if (rollout <= 0) return false;
  return bucket(rolloutKey(flagKey, seed, ctx, salt)) * 100 < rollout;
}

function pickVariant(flagKey: string, seed: string, ctx: Context, variants: Variant[]): string {
  const total = variants.reduce((s, v) => s + (v.weight ?? 1), 0);
  if (total <= 0) return variants[0]?.key ?? "";
  let point = bucket(`${flagKey}:${seed}:variant:${ctx.key}`) * total;
  for (const v of variants) {
    point -= v.weight ?? 1;
    if (point < 0) return v.key;
  }
  return variants[variants.length - 1]!.key;
}

/** Evaluate a boolean flag for a context. */
export function isEnabled(flagKey: string, def: BooleanFlag, ctx: Context): boolean {
  const fallback = def.default ?? false;
  if (def.enabled === false) return fallback;
  const seed = def.seed ?? "";

  for (const rule of def.rules ?? []) {
    if (matchCondition(ctx.attributes ?? {}, rule.when)) {
      if (typeof rule.value === "boolean") return rule.value;
      if (typeof rule.rollout === "number") {
        return inRollout(flagKey, seed, ctx, rule.rollout, ruleSalt(rule)) ? true : fallback;
      }
      return true;
    }
  }
  // Fallthrough rollout: default 100% when there are no rules, but 0% when rules
  // exist (rules define who gets it; set an explicit `rollout` to also include a
  // slice of everyone else).
  const rollout = def.rollout ?? (def.rules && def.rules.length ? 0 : 100);
  return inRollout(flagKey, seed, ctx, rollout) ? true : fallback;
}

/** Evaluate a variant/experiment flag for a context — returns the variant key. */
export function variant(flagKey: string, def: VariantFlag, ctx: Context): string {
  const fallback = def.default ?? def.variants[0]?.key ?? "";
  if (def.enabled === false) return fallback;
  const seed = def.seed ?? "";

  for (const rule of def.rules ?? []) {
    if (matchCondition(ctx.attributes ?? {}, rule.when)) {
      if (typeof rule.value === "string") return rule.value;
      break; // matched a rule with no explicit variant → fall through to weighted split
    }
  }
  return pickVariant(flagKey, seed, ctx, def.variants);
}

function ruleSalt(rule: Rule): string {
  return JSON.stringify(rule.when);
}

const isVariantFlag = (d: FlagDef): d is VariantFlag => d.type === "variant";

/* ------------------------------ the store ------------------------------ */

/**
 * A flag set built from a plain config object. Evaluate synchronously anywhere.
 *
 * @example
 * const flags = new Flags({
 *   "new-dashboard": { rollout: 25 },                       // 25% of users
 *   "beta": { rules: [{ when: { plan: "pro" }, value: true }] },
 *   "checkout-exp": { type: "variant", variants: [
 *     { key: "control", weight: 1 }, { key: "one-click", weight: 1 },
 *   ]},
 * });
 * flags.isEnabled("new-dashboard", { key: user.id });        // stable per user
 * flags.variant("checkout-exp", { key: user.id });           // "control" | "one-click"
 */
export class Flags {
  private defs: Record<string, FlagDef>;

  constructor(defs: Record<string, FlagDef> = {}) {
    this.defs = { ...defs };
  }

  /** Replace / merge flag definitions at runtime (hot config reload). */
  update(defs: Record<string, FlagDef>): this {
    this.defs = { ...this.defs, ...defs };
    return this;
  }

  /** Set (or remove, with `undefined`) a single flag. */
  set(key: string, def: FlagDef | undefined): this {
    if (def === undefined) delete this.defs[key];
    else this.defs[key] = def;
    return this;
  }

  has(key: string): boolean {
    return key in this.defs;
  }

  /** Boolean evaluation. Unknown flag → false. */
  isEnabled(key: string, ctx: Context): boolean {
    const def = this.defs[key];
    if (!def || isVariantFlag(def)) return false;
    return isEnabled(key, def, ctx);
  }

  /** Variant evaluation. Unknown flag → "". */
  variant(key: string, ctx: Context): string {
    const def = this.defs[key];
    if (!def || !isVariantFlag(def)) return "";
    return variant(key, def, ctx);
  }

  /** Generic evaluation → boolean for boolean flags, variant key for variant flags. */
  evaluate(key: string, ctx: Context): boolean | string {
    const def = this.defs[key];
    if (!def) return false;
    return isVariantFlag(def) ? variant(key, def, ctx) : isEnabled(key, def, ctx);
  }

  /**
   * Evaluate every flag for a context — ideal for bootstrapping a client so the
   * browser never flickers or needs a round-trip.
   */
  all(ctx: Context): Record<string, boolean | string> {
    const out: Record<string, boolean | string> = {};
    for (const key of Object.keys(this.defs)) out[key] = this.evaluate(key, ctx);
    return out;
  }

  /** The current raw config. */
  toJSON(): Record<string, FlagDef> {
    return { ...this.defs };
  }
}
