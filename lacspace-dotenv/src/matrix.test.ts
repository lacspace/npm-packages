import { describe, it, expect } from "vitest";
import { envMatrix } from "./matrix.js";

describe("envMatrix", () => {
  it("builds a presence table and lists per-env gaps", () => {
    const m = envMatrix([
      { name: "dev", map: { SHARED: "1", DEBUG: "1" } },
      { name: "prod", map: { SHARED: "1", STRIPE_KEY: "sk" } },
    ]);
    expect(m.keys).toEqual(["DEBUG", "SHARED", "STRIPE_KEY"]);
    expect(m.present.SHARED).toEqual({ dev: true, prod: true });
    expect(m.present.DEBUG).toEqual({ dev: true, prod: false });
    expect(m.missing.prod).toEqual(["DEBUG"]);
    expect(m.missing.dev).toEqual(["STRIPE_KEY"]);
    expect(m.common).toEqual(["SHARED"]);
  });

  it("has no gaps when every env declares the same keys", () => {
    const m = envMatrix([
      { name: "a", map: { X: "1", Y: "2" } },
      { name: "b", map: { X: "9", Y: "8" } },
    ]);
    expect(m.missing.a).toEqual([]);
    expect(m.missing.b).toEqual([]);
    expect(m.common).toEqual(["X", "Y"]);
  });
});
