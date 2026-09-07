import { describe, it, expect } from "vitest";
import {
  reserveAmount,
  holdReserve,
  isReleased,
  reserveBalance,
  type Clock,
} from "./index";

const DAY = 86_400_000;
const T0 = Date.parse("2026-01-01T00:00:00Z");

describe("reserve — rolling reserve with injected clock", () => {
  it("computes a percent reserve (floored) capped at the base", () => {
    expect(reserveAmount(10_000, { bps: 1000, releaseAfterDays: 7 })).toBe(1000);
    expect(reserveAmount(999, { bps: 250, releaseAfterDays: 7 })).toBe(24); // floor 24.975
    expect(reserveAmount(100, { flat: 500, releaseAfterDays: 7 })).toBe(100); // cap at base
  });

  it("holds with a release date N days out, from the injected clock", () => {
    const clock: Clock = () => T0;
    const e = holdReserve(10_000, { bps: 1000, releaseAfterDays: 7 }, clock, "txn_1");
    expect(e.amount).toBe(1000);
    expect(e.heldAt).toBe(T0);
    expect(e.releaseAt).toBe(T0 + 7 * DAY);
    expect(e.ref).toBe("txn_1");
  });

  it("is held before release and available after (clock drives it)", () => {
    const e = holdReserve(10_000, { bps: 1000, releaseAfterDays: 7 }, () => T0);

    const before: Clock = () => T0 + 6 * DAY;
    expect(isReleased(e, before)).toBe(false);
    expect(reserveBalance([e], before)).toEqual({ held: 1000, available: 0 });

    const after: Clock = () => T0 + 7 * DAY;
    expect(isReleased(e, after)).toBe(true);
    expect(reserveBalance([e], after)).toEqual({ held: 0, available: 1000 });
  });

  it("splits a set of reserves into held vs available at a moment", () => {
    const a = holdReserve(10_000, { bps: 1000, releaseAfterDays: 2 }, () => T0);
    const b = holdReserve(20_000, { bps: 500, releaseAfterDays: 10 }, () => T0);
    const bal = reserveBalance([a, b], () => T0 + 5 * DAY);
    expect(bal).toEqual({ held: 1000, available: 1000 });
  });
});
