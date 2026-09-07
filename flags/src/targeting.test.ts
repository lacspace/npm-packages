import { describe, expect, it } from "vitest";
import { matchesSegment } from "./targeting";
import type { Context } from "./index";

const ctx = (attributes: Context["attributes"]): Context => ({ key: "u1", attributes });

describe("matchesSegment", () => {
  it("matches on equality and no-matches when different", () => {
    const seg = { match: { country: "US" } };
    expect(matchesSegment(ctx({ country: "US" }), seg)).toBe(true);
    expect(matchesSegment(ctx({ country: "DE" }), seg)).toBe(false);
  });

  it("supports in / gte operators", () => {
    const seg = { match: { plan: { in: ["pro", "team"] }, seats: { gte: 5 } } };
    expect(matchesSegment(ctx({ plan: "pro", seats: 10 }), seg)).toBe(true);
    expect(matchesSegment(ctx({ plan: "pro", seats: 2 }), seg)).toBe(false);
    expect(matchesSegment(ctx({ plan: "free", seats: 10 }), seg)).toBe(false);
  });

  it("supports endsWith / startsWith (new operators)", () => {
    expect(matchesSegment(ctx({ email: "a@lacspace.com" }), { match: { email: { endsWith: "@lacspace.com" } } })).toBe(true);
    expect(matchesSegment(ctx({ email: "a@gmail.com" }), { match: { email: { endsWith: "@lacspace.com" } } })).toBe(false);
    expect(matchesSegment(ctx({ sku: "PRO-123" }), { match: { sku: { startsWith: "PRO-" } } })).toBe(true);
  });

  it("supports a custom operator predicate", () => {
    const seg = { match: { age: { predicate: (v: unknown) => typeof v === "number" && v % 2 === 0 } } };
    expect(matchesSegment(ctx({ age: 24 }), seg)).toBe(true);
    expect(matchesSegment(ctx({ age: 25 }), seg)).toBe(false);
  });

  it("supports a whole-context predicate that runs after match", () => {
    const seg = {
      match: { country: "US" },
      predicate: (c: Context) => c.key.startsWith("beta-"),
    };
    expect(matchesSegment({ key: "beta-9", attributes: { country: "US" } }, seg)).toBe(true);
    expect(matchesSegment({ key: "prod-9", attributes: { country: "US" } }, seg)).toBe(false);
    // match fails → predicate never decides it in
    expect(matchesSegment({ key: "beta-9", attributes: { country: "DE" } }, seg)).toBe(false);
  });

  it("empty segment matches everyone", () => {
    expect(matchesSegment(ctx({}), {})).toBe(true);
    expect(matchesSegment({ key: "u" }, {})).toBe(true);
  });
});
