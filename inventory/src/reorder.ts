/**
 * Reorder logic — decide *when* to buy more and *how much*. Pure functions over
 * a `Stock` plus a {@link ReorderPolicy}. Two classic replenishment styles are
 * supported: order-up-to a target level, or fixed whole-batch quantities.
 */
import { InventoryError, available } from "./index";
import type { Stock } from "./index";
import { toCount } from "./_shared";

/** Replenishment policy for a single SKU. All levels are integer units. */
export interface ReorderPolicy {
  /** Reorder when {@link available} falls at or below this level. */
  reorderPoint: number;
  /** Buffer to keep on hand for demand variability (default `0`). */
  safetyStock?: number;
  /** Fixed batch size — orders are rounded up to whole multiples of this. */
  reorderQuantity?: number;
  /** Order-up-to target: replenish available back up to this level. */
  maxStock?: number;
}

function normalisePolicy(policy: ReorderPolicy): Required<Pick<ReorderPolicy, "reorderPoint" | "safetyStock">> & {
  reorderQuantity: number | null;
  maxStock: number | null;
} {
  const reorderPoint = toCount(policy.reorderPoint, "reorderPoint");
  if (reorderPoint < 0) throw new InventoryError("reorderPoint must be >= 0");
  const safetyStock = policy.safetyStock == null ? 0 : toCount(policy.safetyStock, "safetyStock");
  if (safetyStock < 0) throw new InventoryError("safetyStock must be >= 0");
  const reorderQuantity =
    policy.reorderQuantity == null ? null : toCount(policy.reorderQuantity, "reorderQuantity");
  if (reorderQuantity != null && reorderQuantity <= 0) {
    throw new InventoryError("reorderQuantity must be > 0");
  }
  const maxStock = policy.maxStock == null ? null : toCount(policy.maxStock, "maxStock");
  if (maxStock != null && maxStock < 0) throw new InventoryError("maxStock must be >= 0");
  return { reorderPoint, safetyStock, reorderQuantity, maxStock };
}

/** `true` when available stock has fallen to or below the reorder point. */
export function needsReorder(stock: Stock, policy: ReorderPolicy): boolean {
  const { reorderPoint } = normalisePolicy(policy);
  return available(stock) <= reorderPoint;
}

/**
 * Suggested purchase quantity to bring stock back to a healthy level.
 *
 * - Returns `0` when {@link needsReorder} is `false`.
 * - Order-up-to a `maxStock` target when set, otherwise up to
 *   `reorderPoint + safetyStock`.
 * - When `reorderQuantity` is set, the result is at least one batch and is
 *   rounded up to a whole multiple of it.
 *
 * The result is always a non-negative integer.
 */
export function suggestedOrderQuantity(stock: Stock, policy: ReorderPolicy): number {
  const p = normalisePolicy(policy);
  if (available(stock) > p.reorderPoint) return 0;
  const avail = available(stock);
  const target = p.maxStock != null ? p.maxStock : p.reorderPoint + p.safetyStock;
  let qty = Math.max(0, target - avail);
  if (p.reorderQuantity != null) {
    // Never below one batch when a reorder is triggered, and always whole batches.
    qty = Math.max(qty, p.reorderQuantity);
    qty = Math.ceil(qty / p.reorderQuantity) * p.reorderQuantity;
  }
  return qty;
}
