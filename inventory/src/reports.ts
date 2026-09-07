/**
 * Reports — batch views over many SKUs: which are low on stock, and which lots
 * are expiring soon. Both take an **injectable clock** (`now`) so they are fully
 * deterministic in tests; nothing here touches the wall clock unless you let it.
 */
import { available } from "./index";
import type { Stock } from "./index";
import { expiringLots } from "./lots";
import type { Lot } from "./lots";
import { toCount } from "./_shared";

/** A SKU's stock plus its low-stock threshold. */
export interface LowStockItem {
  sku: string;
  stock: Stock;
  /** Alert when `available <= threshold`. */
  threshold: number;
}

/** A low-stock alert row. */
export interface LowStockAlert {
  sku: string;
  available: number;
  threshold: number;
}

/** Return one alert per SKU whose `available` is at or below its threshold. */
export function lowStockReport(items: readonly LowStockItem[]): LowStockAlert[] {
  const out: LowStockAlert[] = [];
  for (const it of items) {
    const avail = available(it.stock);
    if (avail <= toCount(it.threshold, `threshold[${it.sku}]`)) {
      out.push({ sku: it.sku, available: avail, threshold: it.threshold });
    }
  }
  return out;
}

/** A SKU and its lots. */
export interface LotStockItem {
  sku: string;
  lots: readonly Lot[];
}

/** An expiring-soon alert row. */
export interface ExpiringAlert {
  sku: string;
  lot: Lot;
}

/**
 * Return one alert per lot expiring within `withinMs` of `now` (soonest first),
 * flattened across every SKU. Already-expired lots and lots without an
 * `expiresAt` are excluded.
 *
 * @param now injected clock, epoch-ms (default `Date.now()`).
 */
export function expiringSoonReport(
  items: readonly LotStockItem[],
  withinMs: number,
  now: number = Date.now(),
): ExpiringAlert[] {
  const t = toCount(now, "now");
  const out: ExpiringAlert[] = [];
  for (const it of items) {
    for (const lot of expiringLots(it.lots, withinMs, t)) {
      out.push({ sku: it.sku, lot });
    }
  }
  return out;
}
