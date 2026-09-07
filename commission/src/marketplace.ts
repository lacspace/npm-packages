/**
 * Marketplace payout split: take a platform commission off a gross payment,
 * optionally add tax on that commission, and share the remainder among the
 * other parties (seller, affiliate, …) — with a full per-party breakdown whose
 * lines sum to the gross **exactly** (no minor units lost or invented).
 *
 * All money is integer minor units. The platform take-rate reuses the existing
 * {@link commission} engine; the remainder is allocated with the existing
 * exact-sum {@link split}, so conservation is guaranteed.
 */

import { commission, split, type CommissionRule, type Share, type SplitPart } from "./index";
import { taxOnCommission } from "./tax";
import { type RoundingMode } from "./rounding";

/** Optional tax applied to the platform commission in a marketplace split. */
export interface MarketplaceTax {
  /** Tax rate (0..1). */
  rate: number;
  /** `true` = commission already includes the tax; `false`/omitted = added on top. */
  inclusive?: boolean;
  /** Rounding mode for the tax line (default `half-up`). */
  rounding?: RoundingMode;
}

/** Configuration for {@link marketplaceSplit}. */
export interface MarketplaceConfig {
  /** The platform's take-rate rule (flat / percent / tiered). */
  platform: CommissionRule;
  /** The remaining parties (seller, affiliate, …) that share what's left. */
  parties: Share[];
  /** Label for the platform line (default `"platform"`). */
  platformLabel?: string;
  /** Label for the tax line (default `"tax"`). */
  taxLabel?: string;
  /** Optional tax on the platform commission. */
  tax?: MarketplaceTax;
}

/** The kind of a {@link MarketplaceLine}. */
export type MarketplaceLineKind = "platform" | "tax" | "party";

/** One line of a marketplace split; the lines sum to `gross` exactly. */
export interface MarketplaceLine {
  party: string;
  /** Allocated amount, in minor units. */
  amount: number;
  kind: MarketplaceLineKind;
}

/** Result of {@link marketplaceSplit} — all money in minor units. */
export interface MarketplaceResult {
  /** The gross payment that was divided. */
  gross: number;
  /** The platform's commission (its gross take; includes inclusive tax). */
  platformCommission: number;
  /** Tax charged on the commission (`0` when no tax configured). */
  tax: number;
  /** `true` when the tax was treated as inclusive of the commission. */
  taxInclusive: boolean;
  /** Amount shared among `parties` after platform take (and exclusive tax). */
  distributable: number;
  /** The parties' allocations; these sum to `distributable` exactly. */
  parties: SplitPart[];
  /** Every line (platform, tax, parties); these sum to `gross` exactly. */
  lines: MarketplaceLine[];
}

/**
 * Split `gross` across the platform and the remaining parties.
 *
 * The platform commission comes from {@link commission}. When `tax` is given it
 * is computed on that commission via {@link taxOnCommission}: an *exclusive* tax
 * is a separate slice of the gross, while an *inclusive* tax is already part of
 * the commission. The distributable remainder is shared with {@link split}, so
 * every returned line reconciles to `gross` without drift.
 */
export function marketplaceSplit(gross: number, config: MarketplaceConfig): MarketplaceResult {
  const g = Math.trunc(gross);
  const platformLabel = config.platformLabel ?? "platform";
  const taxLabel = config.taxLabel ?? "tax";

  const platformCommission = commission(config.platform, g).commission;

  let tax = 0;
  let taxInclusive = false;
  let externalTax = 0; // tax that is a SEPARATE slice of the gross (exclusive only)
  if (config.tax !== undefined) {
    const t = taxOnCommission(platformCommission, config.tax.rate, {
      inclusive: config.tax.inclusive === true,
      rounding: config.tax.rounding,
    });
    tax = t.tax;
    taxInclusive = t.inclusive;
    if (!taxInclusive) externalTax = tax;
  }

  const distributable = g - platformCommission - externalTax;
  const parties = split(distributable, config.parties);

  const lines: MarketplaceLine[] = [{ party: platformLabel, amount: platformCommission, kind: "platform" }];
  if (externalTax !== 0) lines.push({ party: taxLabel, amount: externalTax, kind: "tax" });
  for (const p of parties) lines.push({ party: p.party, amount: p.amount, kind: "party" });

  return {
    gross: g,
    platformCommission,
    tax,
    taxInclusive,
    distributable,
    parties,
    lines,
  };
}
