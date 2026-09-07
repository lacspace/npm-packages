/**
 * Internal date helpers, shared by the timeline + ETA modules. Not part of the
 * public API. Pure, isomorphic (only the built-in `Date`).
 */
import { CourierError } from "./index";

/** Coerce an ISO string / epoch-ms number / `Date` into a valid `Date`. */
export function toDate(value: string | number | Date): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new CourierError("Invalid Date value.", { code: "invalid_date" });
    }
    return new Date(value.getTime());
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new CourierError(`Invalid date: ${String(value)}`, { code: "invalid_date" });
  }
  return d;
}

/** A copy of `d` truncated to local midnight — used for day-level comparisons. */
export function startOfDay(d: Date): Date {
  const x = new Date(d.getTime());
  x.setHours(0, 0, 0, 0);
  return x;
}
