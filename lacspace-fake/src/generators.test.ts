import { describe, it, expect } from "vitest";
import { RNG } from "./prng.js";
import { callGen, generators, slugify, GEN_ORDER } from "./generators.js";
import type { GenContext, GenArg } from "./generators.js";
import type { Locale } from "./data.js";

function ctx(seed: number | string, locale: Locale = "en", index = 0, row: Record<string, unknown> = {}): GenContext {
  return { rng: new RNG(seed), locale, index, row };
}
function gen(name: string, seed: number | string, args: GenArg[] = [], locale: Locale = "en", row: Record<string, unknown> = {}) {
  return callGen(name, ctx(seed, locale, 0, row), args);
}

describe("person generators", () => {
  it("firstName / lastName are non-empty strings", () => {
    expect(typeof gen("firstName", 1)).toBe("string");
    expect((gen("firstName", 1) as string).length).toBeGreaterThan(0);
    expect(typeof gen("lastName", 1)).toBe("string");
  });

  it("fullName is 'First Last'", () => {
    const v = gen("fullName", 5) as string;
    expect(v.split(" ").length).toBe(2);
  });

  it("age respects int bounds", () => {
    for (let s = 0; s < 50; s++) {
      const v = gen("age", s, [20, 30]) as number;
      expect(v).toBeGreaterThanOrEqual(20);
      expect(v).toBeLessThanOrEqual(30);
    }
  });

  it("dateOfBirth is an ISO date", () => {
    expect(gen("dateOfBirth", 1)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("internet generators", () => {
  it("email contains @ and a domain", () => {
    const v = gen("email", 3) as string;
    expect(v).toMatch(/@/);
    expect(v.split("@")[1]).toMatch(/\./);
  });

  it("email derives from an existing firstName/lastName in the row", () => {
    const row = { firstName: "Ada", lastName: "Lovelace" };
    const v = gen("email", 3, [], "en", row) as string;
    expect(v.toLowerCase()).toContain("ada");
    expect(v.toLowerCase()).toContain("lovelace");
  });

  it("uuid matches v4", () => {
    expect(gen("uuid", 1)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("ipv4 has four octets in range", () => {
    const v = gen("ipv4", 8) as string;
    const parts = v.split(".").map(Number);
    expect(parts).toHaveLength(4);
    for (const p of parts) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(255);
    }
  });

  it("mac is 6 hex pairs", () => {
    expect(gen("mac", 2)).toMatch(/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/);
  });

  it("slug is url-safe", () => {
    expect(gen("slug", 4)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("password respects requested length", () => {
    expect((gen("password", 1, [20]) as string).length).toBe(20);
  });
});

describe("numbers / enums", () => {
  it("int(min..max) stays in bounds and hits both ends", () => {
    const seen = new Set<number>();
    for (let s = 0; s < 300; s++) seen.add(gen("int", s, [1, 3]) as number);
    expect([...seen].every((n) => n >= 1 && n <= 3)).toBe(true);
    expect(seen.has(1)).toBe(true);
    expect(seen.has(3)).toBe(true);
  });

  it("oneOf only returns provided options", () => {
    for (let s = 0; s < 50; s++) {
      const v = gen("oneOf", s, ["admin", "user"]);
      expect(["admin", "user"]).toContain(v);
    }
  });

  it("oneOf throws with no options", () => {
    expect(() => gen("oneOf", 1, [])).toThrow();
  });

  it("weighted returns a provided value", () => {
    const v = gen("weighted", 1, ["a:1", "b:5"]);
    expect(["a", "b"]).toContain(v);
  });

  it("bool(1)/bool(0)", () => {
    expect(gen("bool", 1, [1])).toBe(true);
    expect(gen("bool", 1, [0])).toBe(false);
  });

  it("float honours decimals arg", () => {
    const v = gen("float", 2, [0, 10, 1]) as number;
    const decimals = (String(v).split(".")[1] ?? "").length;
    expect(decimals).toBeLessThanOrEqual(1);
  });
});

describe("commerce / datetime", () => {
  it("price is within range", () => {
    const v = gen("price", 3, [10, 20]) as number;
    expect(v).toBeGreaterThanOrEqual(10);
    expect(v).toBeLessThanOrEqual(20);
  });
  it("past is a valid ISO timestamp in the past", () => {
    const v = gen("past", 1) as string;
    expect(Date.parse(v)).toBeLessThanOrEqual(Date.now());
  });
  it("future is after now", () => {
    const v = gen("future", 1) as string;
    expect(Date.parse(v)).toBeGreaterThan(Date.now());
  });
  it("between stays inside the window", () => {
    const v = Date.parse(gen("between", 5, ["2020-01-01", "2020-12-31"]) as string);
    expect(v).toBeGreaterThanOrEqual(Date.parse("2020-01-01"));
    expect(v).toBeLessThanOrEqual(Date.parse("2020-12-31") + 86400000);
  });
});

describe("ids", () => {
  it("autoincrement uses row index", () => {
    expect(callGen("autoincrement", ctx(1, "en", 0), [])).toBe(1);
    expect(callGen("autoincrement", ctx(1, "en", 4), [])).toBe(5);
    expect(callGen("autoincrement", ctx(1, "en", 0), [100])).toBe(100);
  });
  it("objectId is 24 hex chars", () => {
    expect(gen("objectId", 1)).toMatch(/^[0-9a-f]{24}$/);
  });
});

describe("Nepal locale", () => {
  it("phone is a +977 mobile", () => {
    const v = gen("phone", 1, [], "ne") as string;
    expect(v).toMatch(/^\+977(98|97)\d{8}$/);
  });
  it("currency is NPR", () => {
    expect(gen("currency", 1, [], "ne")).toBe("NPR");
  });
  it("country is Nepal", () => {
    expect(gen("country", 1, [], "ne")).toBe("Nepal");
  });
  it("province is a real Nepal province", () => {
    const provinces = ["Koshi", "Madhesh", "Bagmati", "Gandaki", "Lumbini", "Karnali", "Sudurpashchim"];
    for (let s = 0; s < 30; s++) expect(provinces).toContain(gen("state", s, [], "ne"));
  });
  it("pan is 9 digits", () => {
    expect(gen("pan", 1, [], "ne")).toMatch(/^\d{9}$/);
  });
  it("english locale phone is +1", () => {
    expect(gen("phone", 1, [], "en")).toMatch(/^\+1\d{10}$/);
  });
});

describe("registry integrity", () => {
  it("callGen throws on unknown generator", () => {
    expect(() => gen("nope", 1)).toThrow(/Unknown generator/);
  });
  it("every GEN_ORDER name exists in the registry", () => {
    for (const n of GEN_ORDER) expect(generators[n]).toBeTypeOf("function");
  });
  it("slugify strips accents and punctuation", () => {
    expect(slugify("Café del Mar!")).toBe("cafe-del-mar");
  });
});
