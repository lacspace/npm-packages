import { describe, it, expect } from "vitest";
import { RNG } from "./prng.js";
import { callGen } from "./generators.js";
import type { GenContext, GenArg } from "./generators.js";
import type { Locale } from "./data.js";
import { MIME_TYPES, TIMEZONES, EXTRA_GEN_ORDER } from "./extras.js";

function ctx(seed: number | string, locale: Locale = "en"): GenContext {
  return { rng: new RNG(seed), locale, index: 0, row: {} };
}
function gen(name: string, seed: number | string, args: GenArg[] = [], locale: Locale = "en") {
  return callGen(name, ctx(seed, locale), args);
}

describe("0.2.0 extra generators — shape", () => {
  it("ulid is 26 Crockford-base32 chars", () => {
    expect(gen("ulid", 1)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("hexColor / hex are #rrggbb", () => {
    expect(gen("hexColor", 2)).toMatch(/^#[0-9a-f]{6}$/);
    expect(gen("hex", 2)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("rgb is rgb(r, g, b) in range", () => {
    const v = gen("rgb", 3) as string;
    const m = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(v);
    expect(m).not.toBeNull();
    for (const n of [m![1], m![2], m![3]].map(Number)) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(255);
    }
  });

  it("semver is x.y.z", () => {
    expect(gen("semver", 4)).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("mimeType comes from the known set", () => {
    expect(MIME_TYPES).toContain(gen("mimeType", 5) as string);
  });

  it("timezone comes from the known set", () => {
    expect(TIMEZONES).toContain(gen("timezone", 6) as string);
  });

  it("filePath looks like an absolute path with an extension", () => {
    expect(gen("filePath", 7)).toMatch(/^\/[a-z0-9/_-]+\.[a-z0-9]+$/i);
  });

  it("fileExt is a short alnum extension", () => {
    expect(gen("fileExt", 8)).toMatch(/^[a-z0-9]+$/);
  });

  it("creditCardMasked masks all but the last group", () => {
    const v = gen("creditCardMasked", 9) as string;
    expect(v).toMatch(/^\*{4} /);
    expect(v.replace(/[^\d]/g, "")).toMatch(/^\d{4}$/); // exactly 4 real digits
  });

  it("iban starts with the locale country code + 2 digits", () => {
    expect(gen("iban", 10, [], "en")).toMatch(/^US\d{2}[0-9A-Z]{16}$/);
    expect(gen("iban", 10, [], "fr")).toMatch(/^FR\d{2}[0-9A-Z]{16}$/);
  });

  it("bic embeds the locale country code", () => {
    expect(gen("bic", 11, [], "es")).toMatch(/^[A-Z]{4}ES[0-9A-Z]{2}$/);
  });
});

describe("0.2.0 extra generators — determinism", () => {
  for (const name of EXTRA_GEN_ORDER) {
    it(`${name} is byte-identical for the same seed`, () => {
      expect(gen(name, 123)).toEqual(gen(name, 123));
    });
  }

  it("different seeds diverge for a high-entropy generator", () => {
    expect(gen("ulid", 1)).not.toEqual(gen("ulid", 2));
  });
});
