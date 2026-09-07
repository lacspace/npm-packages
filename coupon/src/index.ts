/**
 * @lacspace/coupon
 *
 * Discount / coupon engine — percent, fixed, free-shipping, BOGO / buy-X-get-Y
 * and tiered/threshold codes with validity windows, minimum-subtotal
 * thresholds, discount caps, usage limits (total & per-user), first-order and
 * product/category scope constraints, a currency guard, coupon stacking and
 * CSPRNG code generation. All money is expressed in integer minor units (e.g.
 * cents) so there is no floating-point drift.
 *
 * Zero runtime dependencies. Isomorphic (Node, edge, browser).
 */

/**
 * Kind of discount a coupon grants.
 *
 * - `percent`       — a whole-percentage discount off the eligible subtotal.
 * - `fixed`         — a flat amount (minor units) off the eligible subtotal.
 * - `free-shipping` — zeroes the shipping line.
 * - `bogo`          — buy-X-get-Y: the cheapest Y units per group are discounted.
 * - `tiered`        — the highest matching threshold tier in `tiers` applies.
 */
export type CouponType =
  | "percent"
  | "fixed"
  | "free-shipping"
  | "bogo"
  | "tiered";

/** A single threshold tier for a `tiered` coupon. */
export interface CouponTier {
  /** Minimum eligible subtotal (minor units) for this tier to apply. */
  minSubtotal: number;
  /** Whether this tier grants a `percent` or a `fixed` discount. */
  type: "percent" | "fixed";
  /** Whole percent `0..100` for `percent`, or minor units for `fixed`. */
  value: number;
}

/** A discount coupon definition. */
export interface Coupon {
  /** The code a customer enters. */
  code: string;
  /** Kind of discount. */
  type: CouponType;
  /**
   * For `percent`, a whole percentage 0..100. For `fixed`, an amount in minor
   * units. Ignored for `free-shipping`, `bogo` and `tiered`.
   */
  value?: number;
  /** Minimum order subtotal (minor units) required for the coupon to apply. */
  minSubtotal?: number;
  /** Maximum discount (minor units) the coupon may grant. */
  maxDiscount?: number;
  /** ISO-8601 timestamp before which the coupon is not yet valid. */
  startsAt?: string;
  /** ISO-8601 timestamp after which the coupon has expired. */
  endsAt?: string;
  /** Alias for `startsAt` (used if `startsAt` is absent). */
  validFrom?: string;
  /** Alias for `endsAt` (used if `endsAt` is absent). */
  validUntil?: string;
  /** How many times the coupon may be redeemed in total. */
  usageLimit?: number;
  /** How many times it has already been redeemed. */
  used?: number;
  /** How many times a single user may redeem the coupon. */
  perUserLimit?: number;
  /** Only valid on a customer's first order. */
  firstOrderOnly?: boolean;
  /** Restrict the discount to these product ids (empty/absent = all). */
  includeProducts?: string[];
  /** Never discount these product ids. */
  excludeProducts?: string[];
  /** Restrict the discount to these categories (empty/absent = all). */
  includeCategories?: string[];
  /** Never discount these categories. */
  excludeCategories?: string[];
  /** For `bogo`: how many units must be bought per group (default 1). */
  buyQuantity?: number;
  /** For `bogo`: how many units are discounted per group (default 1). */
  getQuantity?: number;
  /** For `bogo`: percent off the discounted units (default 100 = free). */
  getDiscountPercent?: number;
  /** For `tiered`: the threshold tiers, highest matching one applies. */
  tiers?: CouponTier[];
  /** Whether this coupon may be combined with others when stacking. */
  stackable?: boolean;
  /** Stacking priority; higher applies first (default 0). */
  priority?: number;
  /** Optional currency tag; when set it must match the order's currency. */
  currency?: string;
}

/** A single order line item, used for scope and `bogo` computation. */
export interface OrderItem {
  /** Product id, matched against include/exclude product scope. */
  productId?: string;
  /** Category, matched against include/exclude category scope. */
  category?: string;
  /** Unit price in minor units. */
  unitPrice: number;
  /** Quantity ordered. */
  quantity: number;
}

/** Order context passed to {@link validateCoupon} and {@link applyCoupon}. */
export interface OrderContext {
  /** Order subtotal in minor units. */
  subtotal: number;
  /** Shipping cost in minor units. */
  shipping?: number;
  /** Evaluation time (defaults to `new Date()`). */
  now?: Date;
  /** Order currency, compared against a coupon's `currency` guard. */
  currency?: string;
  /** How many times the current user has already redeemed the coupon. */
  userUsed?: number;
  /** Whether this is the customer's first order. */
  isFirstOrder?: boolean;
  /** Line items, enabling product/category scope and `bogo` discounts. */
  items?: OrderItem[];
}

/** Result of validating a coupon against a context. */
export interface CouponValidation {
  valid: boolean;
  reason?: string;
}

/** A single component of an applied discount, for a clear breakdown. */
export interface CouponBreakdown {
  /** Where the discount came from: the coupon type or `shipping`. */
  kind: CouponType | "shipping";
  /** Amount removed by this component (minor units). */
  amount: number;
}

/** Result of applying a coupon to an order. */
export interface CouponResult extends CouponValidation {
  /** Discount applied to the subtotal (minor units). */
  discount: number;
  /** Discount applied to shipping (minor units). */
  shippingDiscount: number;
  /** Final payable total (minor units). */
  total: number;
  /** Line-item breakdown of the discount (minor units). */
  breakdown?: CouponBreakdown[];
}

/* -------------------------------------------------------------------------- */
/* Internal helpers                                                           */
/* -------------------------------------------------------------------------- */

function startTime(coupon: Coupon): string | undefined {
  return coupon.startsAt ?? coupon.validFrom;
}

function endTime(coupon: Coupon): string | undefined {
  return coupon.endsAt ?? coupon.validUntil;
}

/** Does an item fall within the coupon's product/category scope? */
function itemInScope(coupon: Coupon, item: OrderItem): boolean {
  const {
    includeProducts,
    excludeProducts,
    includeCategories,
    excludeCategories,
  } = coupon;
  if (excludeProducts && item.productId && excludeProducts.includes(item.productId)) {
    return false;
  }
  if (excludeCategories && item.category && excludeCategories.includes(item.category)) {
    return false;
  }
  if (includeProducts && includeProducts.length > 0) {
    if (!item.productId || !includeProducts.includes(item.productId)) return false;
  }
  if (includeCategories && includeCategories.length > 0) {
    if (!item.category || !includeCategories.includes(item.category)) return false;
  }
  return true;
}

function hasScope(coupon: Coupon): boolean {
  return Boolean(
    (coupon.includeProducts && coupon.includeProducts.length) ||
      (coupon.excludeProducts && coupon.excludeProducts.length) ||
      (coupon.includeCategories && coupon.includeCategories.length) ||
      (coupon.excludeCategories && coupon.excludeCategories.length),
  );
}

/** Sum of the minor-unit value of the items a coupon may discount. */
function eligibleSubtotal(coupon: Coupon, ctx: OrderContext): number {
  const items = ctx.items;
  if (!items || items.length === 0) return ctx.subtotal;
  let sum = 0;
  for (const item of items) {
    if (itemInScope(coupon, item)) sum += item.unitPrice * item.quantity;
  }
  return sum;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Validate a coupon against an order context: checks the validity window,
 * minimum-subtotal threshold, total & per-user usage limits, first-order and
 * product/category scope constraints, and a currency guard. Does not compute
 * any discount.
 */
export function validateCoupon(
  coupon: Coupon,
  ctx: OrderContext,
): CouponValidation {
  const now = ctx.now ?? new Date();
  const t = now.getTime();

  const starts = startTime(coupon);
  if (starts) {
    const s = new Date(starts).getTime();
    if (!Number.isNaN(s) && t < s) {
      return { valid: false, reason: "not-yet-started" };
    }
  }

  const ends = endTime(coupon);
  if (ends) {
    const e = new Date(ends).getTime();
    if (!Number.isNaN(e) && t > e) {
      return { valid: false, reason: "expired" };
    }
  }

  if (
    typeof coupon.currency === "string" &&
    typeof ctx.currency === "string" &&
    coupon.currency !== ctx.currency
  ) {
    return { valid: false, reason: "currency-mismatch" };
  }

  if (typeof coupon.minSubtotal === "number" && ctx.subtotal < coupon.minSubtotal) {
    return { valid: false, reason: "below-min-subtotal" };
  }

  if (
    typeof coupon.usageLimit === "number" &&
    (coupon.used ?? 0) >= coupon.usageLimit
  ) {
    return { valid: false, reason: "usage-limit-reached" };
  }

  if (
    typeof coupon.perUserLimit === "number" &&
    (ctx.userUsed ?? 0) >= coupon.perUserLimit
  ) {
    return { valid: false, reason: "per-user-limit-reached" };
  }

  if (coupon.firstOrderOnly && ctx.isFirstOrder === false) {
    return { valid: false, reason: "not-first-order" };
  }

  // Scope only rejects when line items are known and none of them qualify.
  if (hasScope(coupon) && ctx.items && ctx.items.length > 0) {
    const anyInScope = ctx.items.some((i) => itemInScope(coupon, i));
    if (!anyInScope) return { valid: false, reason: "out-of-scope" };
  }

  return { valid: true };
}

/* -------------------------------------------------------------------------- */
/* Discount computation                                                       */
/* -------------------------------------------------------------------------- */

/** Percent/fixed discount off a given base subtotal (minor units). */
function flatDiscount(type: "percent" | "fixed", value: number, base: number): number {
  if (type === "percent") return Math.round((base * value) / 100);
  return Math.min(value, base);
}

/** Compute the raw BOGO discount over the eligible items (minor units). */
function bogoDiscount(coupon: Coupon, ctx: OrderContext): number {
  const items = ctx.items;
  if (!items || items.length === 0) return 0;
  const buy = Math.max(1, Math.floor(coupon.buyQuantity ?? 1));
  const get = Math.max(1, Math.floor(coupon.getQuantity ?? 1));
  const getPct = coupon.getDiscountPercent ?? 100;

  // Expand eligible items into one unit-price entry per unit.
  const units: number[] = [];
  for (const item of items) {
    if (!itemInScope(coupon, item)) continue;
    const qty = Math.max(0, Math.floor(item.quantity));
    for (let i = 0; i < qty; i++) units.push(item.unitPrice);
  }
  const groupSize = buy + get;
  const groups = Math.floor(units.length / groupSize);
  if (groups <= 0) return 0;
  const freeUnits = groups * get;

  // Discount the cheapest units first (standard "cheapest free" BOGO).
  units.sort((a, b) => a - b);
  let discount = 0;
  for (let i = 0; i < freeUnits; i++) {
    const price = units[i] ?? 0;
    discount += Math.round((price * getPct) / 100);
  }
  return discount;
}

/** Pick the highest matching tier's discount for a `tiered` coupon. */
function tieredDiscount(coupon: Coupon, base: number): number {
  const tiers = coupon.tiers;
  if (!tiers || tiers.length === 0) return 0;
  let best: CouponTier | undefined;
  for (const tier of tiers) {
    if (base >= tier.minSubtotal) {
      if (!best || tier.minSubtotal > best.minSubtotal) best = tier;
    }
  }
  if (!best) return 0;
  return flatDiscount(best.type, best.value, base);
}

/**
 * Apply a coupon to an order. Validates first; when invalid, returns zero
 * discounts and the untouched total. When valid, computes the discount:
 *
 * - `percent`  → `round(eligibleSubtotal * value / 100)`, capped by `maxDiscount`
 *   and never more than the eligible subtotal.
 * - `fixed`    → `min(value, eligibleSubtotal)`, capped by `maxDiscount`.
 * - `free-shipping` → `shippingDiscount = shipping`.
 * - `bogo`     → the cheapest `getQuantity` units per `buyQuantity + getQuantity`
 *   group are discounted by `getDiscountPercent` (needs `items`).
 * - `tiered`   → the highest matching `tiers` entry applies.
 *
 * `total = max(0, subtotal - discount + shipping - shippingDiscount)`.
 */
export function applyCoupon(
  coupon: Coupon,
  ctx: OrderContext,
): CouponResult {
  const subtotal = ctx.subtotal;
  const shipping = ctx.shipping ?? 0;

  const validation = validateCoupon(coupon, ctx);
  if (!validation.valid) {
    return {
      ...validation,
      discount: 0,
      shippingDiscount: 0,
      total: Math.max(0, subtotal + shipping),
    };
  }

  const eligible = eligibleSubtotal(coupon, ctx);

  let discount = 0;
  let shippingDiscount = 0;

  switch (coupon.type) {
    case "percent": {
      discount = flatDiscount("percent", coupon.value ?? 0, eligible);
      break;
    }
    case "fixed": {
      discount = flatDiscount("fixed", coupon.value ?? 0, eligible);
      break;
    }
    case "free-shipping": {
      shippingDiscount = shipping;
      break;
    }
    case "bogo": {
      discount = bogoDiscount(coupon, ctx);
      break;
    }
    case "tiered": {
      discount = tieredDiscount(coupon, eligible);
      break;
    }
  }

  if (typeof coupon.maxDiscount === "number") {
    discount = Math.min(discount, coupon.maxDiscount);
  }
  // Never discount more than the eligible subtotal (equals the full subtotal
  // when no line items / scope are provided).
  discount = Math.min(discount, eligible);
  discount = Math.max(0, discount);
  shippingDiscount = Math.max(0, Math.min(shippingDiscount, shipping));

  const total = Math.max(0, subtotal - discount + shipping - shippingDiscount);

  const breakdown: CouponBreakdown[] = [];
  if (discount > 0) breakdown.push({ kind: coupon.type, amount: discount });
  if (shippingDiscount > 0) breakdown.push({ kind: "shipping", amount: shippingDiscount });

  return { valid: true, discount, shippingDiscount, total, breakdown };
}

export * from "./codes";
export * from "./stacking";
