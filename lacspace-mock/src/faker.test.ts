import { describe, it, expect } from "vitest";
import { createFaker, mulberry32, hashSeed, resolveFake } from "./faker.js";

describe("faker", () => {
  it("is deterministic for a given seed", () => {
    const a = createFaker("seed-1");
    const b = createFaker("seed-1");
    expect(a.name()).toBe(b.name());
    expect(a.email()).toBe(b.email());
    expect(a.uuid()).toBe(b.uuid());
  });

  it("differs across seeds", () => {
    const a = createFaker("seed-1");
    const b = createFaker("seed-2");
    // extremely unlikely to collide across 3 draws
    const same = a.name() === b.name() && a.email() === b.email() && a.uuid() === b.uuid();
    expect(same).toBe(false);
  });

  it("int respects bounds", () => {
    const f = createFaker("x");
    for (let i = 0; i < 200; i++) {
      const n = f.int(5, 9);
      expect(n).toBeGreaterThanOrEqual(5);
      expect(n).toBeLessThanOrEqual(9);
    }
  });

  it("uuid looks like a v4 uuid", () => {
    const f = createFaker("uuid-seed");
    expect(f.uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("email contains an @ and a domain", () => {
    const f = createFaker("mail");
    expect(f.email()).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]+$/);
  });

  it("resolveFake dispatches kinds and args", () => {
    const f = createFaker("r");
    expect(resolveFake(f, "int", ["3", "3"])).toBe("3");
    expect(["true", "false"]).toContain(resolveFake(f, "bool", []));
    expect(resolveFake(f, "unknown", [])).toBe("");
  });

  it("mulberry32/hashSeed produce stable floats", () => {
    const r = mulberry32(hashSeed("abc"));
    const first = r();
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(1);
    const r2 = mulberry32(hashSeed("abc"));
    expect(r2()).toBe(first);
  });
});
