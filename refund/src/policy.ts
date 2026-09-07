/**
 * Refund reason codes and a small, injectable-clock refund policy check.
 *
 * Pure and side-effect free: {@link checkRefundPolicy} reads the clock you give
 * it (or `Date.now()`), returns a plain `{ allowed, reason }` verdict, and never
 * throws. Times are epoch milliseconds; nothing here touches money.
 */

/* -------------------------------------------------------------------------- */
/*  Reason codes                                                               */
/* -------------------------------------------------------------------------- */

/** A machine-readable reason a customer is requesting a refund. */
export type RefundReason =
  | "defective"
  | "damaged"
  | "wrong_item"
  | "not_as_described"
  | "no_longer_wanted"
  | "arrived_late"
  | "better_price"
  | "duplicate_order"
  | "other";

/** All known {@link RefundReason} codes, in a stable order. */
export const REFUND_REASONS: RefundReason[] = [
  "defective",
  "damaged",
  "wrong_item",
  "not_as_described",
  "no_longer_wanted",
  "arrived_late",
  "better_price",
  "duplicate_order",
  "other",
];

/** `true` when `value` is a known {@link RefundReason}. */
export function isRefundReason(value: unknown): value is RefundReason {
  return typeof value === "string" && (REFUND_REASONS as string[]).includes(value);
}

/* -------------------------------------------------------------------------- */
/*  Policy                                                                     */
/* -------------------------------------------------------------------------- */

/** A store's refund policy. Every field is optional; omit one to skip that rule. */
export interface RefundPolicy {
  /** Refund window in days, measured from `purchasedAt`. Omit for no time limit. */
  windowDays?: number;
  /** SKUs that can never be refunded (e.g. final-sale / perishable goods). */
  nonRefundableSkus?: string[];
  /** Reason codes the policy does not accept. */
  disallowedReasons?: RefundReason[];
}

/** The facts about a refund request that the policy is evaluated against. */
export interface PolicyCheckInput {
  /** When the order was placed / delivered (epoch ms). The window is measured from here. */
  purchasedAt: number;
  /** The items being returned; checked against `nonRefundableSkus`. */
  items?: { sku: string }[];
  /** The customer's stated reason; checked against `disallowedReasons`. */
  reason?: RefundReason;
}

/** The verdict of a {@link checkRefundPolicy} call. */
export interface PolicyDecision {
  /** `true` when the refund is permitted under the policy. */
  allowed: boolean;
  /** A human-readable explanation, present only when `allowed` is `false`. */
  reason?: string;
}

/**
 * Check a refund request against a {@link RefundPolicy}. Rules are evaluated in a
 * fixed order — time window, non-refundable SKUs, disallowed reasons — and the
 * first failure is reported. Returns `{ allowed: true }` when every rule passes.
 *
 * The clock is injectable so this is fully deterministic in tests: pass
 * `opts.now` (epoch ms) or `opts.clock` (a `() => number`); otherwise it falls
 * back to `Date.now()`.
 */
export function checkRefundPolicy(
  policy: RefundPolicy,
  input: PolicyCheckInput,
  opts: { now?: number; clock?: () => number } = {},
): PolicyDecision {
  const now = opts.now ?? (opts.clock ? opts.clock() : Date.now());

  if (policy.windowDays !== undefined) {
    const deadline = input.purchasedAt + policy.windowDays * 86_400_000;
    if (now > deadline) {
      return {
        allowed: false,
        reason: `Refund window of ${policy.windowDays} day(s) has passed`,
      };
    }
  }

  if (policy.nonRefundableSkus && policy.nonRefundableSkus.length > 0 && input.items) {
    const blocked = new Set(policy.nonRefundableSkus.map(String));
    for (const it of input.items) {
      if (blocked.has(String(it.sku))) {
        return {
          allowed: false,
          reason: `Item "${it.sku}" is non-refundable`,
        };
      }
    }
  }

  if (
    policy.disallowedReasons &&
    input.reason !== undefined &&
    policy.disallowedReasons.includes(input.reason)
  ) {
    return {
      allowed: false,
      reason: `Reason "${input.reason}" is not eligible for a refund`,
    };
  }

  return { allowed: true };
}
