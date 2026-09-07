import { describe, it, expect } from "vitest";
import {
  REFUND_REASONS,
  isRefundReason,
  checkRefundPolicy,
  type RefundPolicy,
} from "./index";

const DAY = 86_400_000;

describe("refund reasons", () => {
  it("exposes a stable list of reason codes", () => {
    expect(REFUND_REASONS).toContain("defective");
    expect(REFUND_REASONS).toContain("other");
    expect(new Set(REFUND_REASONS).size).toBe(REFUND_REASONS.length);
  });

  it("type-guards known reasons", () => {
    expect(isRefundReason("damaged")).toBe(true);
    expect(isRefundReason("nonsense")).toBe(false);
    expect(isRefundReason(42)).toBe(false);
  });
});

describe("checkRefundPolicy", () => {
  const purchasedAt = 1_000_000_000_000; // fixed epoch ms

  it("passes when inside the window using an injected clock", () => {
    const policy: RefundPolicy = { windowDays: 30 };
    const res = checkRefundPolicy(policy, { purchasedAt }, { now: purchasedAt + 10 * DAY });
    expect(res.allowed).toBe(true);
    expect(res.reason).toBeUndefined();
  });

  it("fails when the window has passed (injected clock)", () => {
    const policy: RefundPolicy = { windowDays: 30 };
    const res = checkRefundPolicy(policy, { purchasedAt }, { now: purchasedAt + 31 * DAY });
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/window of 30/);
  });

  it("accepts a clock function as well as a fixed now", () => {
    const policy: RefundPolicy = { windowDays: 7 };
    const res = checkRefundPolicy(
      policy,
      { purchasedAt },
      { clock: () => purchasedAt + 3 * DAY },
    );
    expect(res.allowed).toBe(true);
  });

  it("blocks non-refundable SKUs", () => {
    const policy: RefundPolicy = { nonRefundableSkus: ["GIFTCARD"] };
    const res = checkRefundPolicy(
      policy,
      { purchasedAt, items: [{ sku: "TEE" }, { sku: "GIFTCARD" }] },
      { now: purchasedAt },
    );
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/GIFTCARD/);
  });

  it("blocks disallowed reasons", () => {
    const policy: RefundPolicy = { disallowedReasons: ["better_price"] };
    const res = checkRefundPolicy(
      policy,
      { purchasedAt, reason: "better_price" },
      { now: purchasedAt },
    );
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/better_price/);
  });

  it("allows when every rule passes", () => {
    const policy: RefundPolicy = {
      windowDays: 30,
      nonRefundableSkus: ["GIFTCARD"],
      disallowedReasons: ["better_price"],
    };
    const res = checkRefundPolicy(
      policy,
      { purchasedAt, items: [{ sku: "TEE" }], reason: "defective" },
      { now: purchasedAt + 5 * DAY },
    );
    expect(res).toEqual({ allowed: true });
  });

  it("reports the window failure before other rules (fixed order)", () => {
    const policy: RefundPolicy = {
      windowDays: 30,
      nonRefundableSkus: ["GIFTCARD"],
    };
    const res = checkRefundPolicy(
      policy,
      { purchasedAt, items: [{ sku: "GIFTCARD" }] },
      { now: purchasedAt + 40 * DAY },
    );
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/window/);
  });
});
