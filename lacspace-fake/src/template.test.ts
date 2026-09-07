import { describe, it, expect } from "vitest";
import { parseFields, generateRows, specFromString } from "./schema.js";
import { RNG } from "./prng.js";
import type { GenContext } from "./generators.js";
import { isTemplateSpec, templateBody } from "./template.js";

function ctx(seed: number | string, row: Record<string, unknown> = {}): GenContext {
  return { rng: new RNG(seed), locale: "en", index: 0, row };
}

describe("template detection", () => {
  it("recognises template(...) specs", () => {
    expect(isTemplateSpec("template({{a}} {{b}})")).toBe(true);
    expect(isTemplateSpec("fullName")).toBe(false);
    expect(templateBody("template({{a}}@{{b}})")).toBe("{{a}}@{{b}}");
  });
});

describe("template interpolation", () => {
  it("reuses earlier row fields", () => {
    const spec = specFromString("template({{firstName}} {{lastName}})");
    const v = spec(ctx(1, { firstName: "Ada", lastName: "Lovelace" }));
    expect(v).toBe("Ada Lovelace");
  });

  it("evaluates generator tokens when not a row field", () => {
    const spec = specFromString("template(v{{int(1..1)}})");
    expect(spec(ctx(1))).toBe("v1");
  });

  it("mixes an existing field with fresh generators", () => {
    const rows = generateRows(
      parseFields("username:username,email:template({{username}}@example.com)"),
      { count: 5, seed: 7 },
    );
    for (const r of rows) {
      expect(String(r["email"])).toBe(`${String(r["username"])}@example.com`);
    }
  });

  it("full name template composes firstName + lastName fields", () => {
    const rows = generateRows(
      parseFields("firstName:firstName,lastName:lastName,full:template({{firstName}} {{lastName}})"),
      { count: 4, seed: 3 },
    );
    for (const r of rows) {
      expect(r["full"]).toBe(`${String(r["firstName"])} ${String(r["lastName"])}`);
    }
  });

  it("is deterministic under a seed", () => {
    const spec = "handle:template({{firstName}}-{{int(1..9)}})";
    const a = generateRows(parseFields(spec), { count: 5, seed: 42 });
    const b = generateRows(parseFields(spec), { count: 5, seed: 42 });
    expect(a).toEqual(b);
  });

  it("commas inside a template body are not split as fields", () => {
    const fields = parseFields("loc:template({{city}}, {{country}})");
    expect(fields).toHaveLength(1);
    const rows = generateRows(fields, { count: 2, seed: 1 });
    expect(String(rows[0]!["loc"])).toContain(", ");
  });
});
