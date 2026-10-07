import { describe, expect, it } from "vitest";
import { createTracker } from "./index";

const ctx = { campaignId: "c1", recipient: "Ram@Example.com", messageId: "<m1@x>" };

describe("unsubscribe tokens (1.1.0)", () => {
  it("round-trips and identifies the recipient by digest", async () => {
    const t = createTracker("a-very-long-secret-123456");
    const tok = await t.unsubscribeToken(ctx);
    const v = await t.verifyUnsubscribe(tok);
    expect(v).toMatchObject({ kind: "unsubscribe", campaignId: "c1", messageId: "<m1@x>" });
    expect(v!.recipient).toBe(await t.recipientId("ram@example.com"));
    expect(v!.url).toBeUndefined();
  });
  it("is not interchangeable with open or click tokens", async () => {
    const t = createTracker("a-very-long-secret-123456");
    expect(await t.verifyUnsubscribe(await t.pixelToken(ctx))).toBeNull();
    expect(await t.resolveClick(await t.unsubscribeToken(ctx))).toBeNull();
  });
  it("outlives click tokens by default and honours unsubscribeTtlDays", async () => {
    let now = Date.UTC(2026, 0, 1);
    const t = createTracker("a-very-long-secret-123456", { now: () => now });
    const u = await t.unsubscribeToken(ctx);
    const p = await t.pixelToken(ctx);
    now += 400 * 86400_000;
    expect(await t.verify(p)).toBeNull();
    expect(await t.verifyUnsubscribe(u)).not.toBeNull();
    const short = createTracker("a-very-long-secret-123456", { now: () => now, unsubscribeTtlDays: 30 });
    const s = await short.unsubscribeToken(ctx);
    now += 31 * 86400_000;
    expect(await short.verifyUnsubscribe(s)).toBeNull();
  });
  it("rejects a tampered unsubscribe token", async () => {
    const t = createTracker("a-very-long-secret-123456");
    const tok = await t.unsubscribeToken(ctx);
    expect(await t.verifyUnsubscribe(tok.slice(0, -2) + (tok.endsWith("A") ? "BB" : "AA"))).toBeNull();
  });
});
