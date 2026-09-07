import { describe, it, expect } from "vitest";
import { parseIcu, isValidIcu, checkIcu } from "./icu.js";
import type { IcuNode } from "./icu.js";

function types(nodes: IcuNode[]): string[] {
  return nodes.map((n) => n.type);
}

describe("parseIcu — structure", () => {
  it("parses plain text as a single text node", () => {
    const r = parseIcu("Hello world");
    expect(r.errors).toEqual([]);
    expect(r.nodes).toEqual([{ type: "text", value: "Hello world" }]);
  });

  it("parses a simple argument", () => {
    const r = parseIcu("Hi {name}!");
    expect(r.errors).toEqual([]);
    expect(types(r.nodes)).toEqual(["text", "arg", "text"]);
    expect(r.nodes[1]).toEqual({ type: "arg", name: "name" });
  });

  it("parses a number/date function argument with a style", () => {
    const r = parseIcu("Total {amount, number, currency}");
    expect(r.errors).toEqual([]);
    const fn = r.nodes.find((n) => n.type === "func");
    expect(fn).toEqual({ type: "func", name: "amount", fn: "number", style: "currency" });
  });

  it("parses a plural with categories, offset and nested arg", () => {
    const r = parseIcu("{count, plural, offset:1 =0 {none} one {# item for {name}} other {# items}}");
    expect(r.errors).toEqual([]);
    const p = r.nodes[0]!;
    expect(p.type).toBe("plural");
    if (p.type === "plural") {
      expect(p.offset).toBe(1);
      expect(p.options.map((o) => o.selector)).toEqual(["=0", "one", "other"]);
      // nested {name} inside the "one" branch
      const one = p.options.find((o) => o.selector === "one")!;
      expect(one.nodes.some((n) => n.type === "arg" && n.name === "name")).toBe(true);
    }
  });

  it("parses a select", () => {
    const r = parseIcu("{g, select, male {he} female {she} other {they}}");
    expect(r.errors).toEqual([]);
    const s = r.nodes[0]!;
    expect(s.type).toBe("select");
    if (s.type === "select") expect(s.options.map((o) => o.selector)).toEqual(["male", "female", "other"]);
  });
});

describe("parseIcu — errors", () => {
  it("flags an unbalanced brace", () => {
    expect(parseIcu("Hi {name").errors.length).toBeGreaterThan(0);
    expect(isValidIcu("Hi {name")).toBe(false);
  });
  it("flags a stray closing brace", () => {
    expect(parseIcu("Hi name}").errors).toContain("unexpected '}'");
  });
  it("flags an unknown plural category", () => {
    const e = parseIcu("{n, plural, one {a} lots {b} other {c}}").errors;
    expect(e.some((x) => x.includes("lots"))).toBe(true);
  });
  it("accepts explicit =N plural categories", () => {
    expect(isValidIcu("{n, plural, =0 {none} one {one} other {many}}")).toBe(true);
  });
  it("flags an unknown ICU function type", () => {
    expect(parseIcu("{x, bogus, a {b}}").errors.some((e) => e.includes("bogus"))).toBe(true);
  });
  it("treats a healthy nested message as valid", () => {
    expect(isValidIcu("{n, plural, one {# thing} other {# things and {m, number}}}")).toBe(true);
  });
});

describe("checkIcu — cross locale", () => {
  it("passes when structure and args match", () => {
    const r = checkIcu(
      "{count, plural, one {# item} other {# items}}",
      "{count, plural, other {# elementi}}",
    );
    expect(r.ok).toBe(true);
    expect(r.mismatches).toEqual([]);
  });

  it("does NOT require identical plural categories across locales", () => {
    // Polish has more categories than English — that's legal, not an error.
    const r = checkIcu(
      "{count, plural, one {# file} other {# files}}",
      "{count, plural, one {# plik} few {# pliki} many {# plików} other {# pliku}}",
    );
    expect(r.ok).toBe(true);
  });

  it("flags a dropped argument", () => {
    const r = checkIcu("Hi {name}, {count} new", "Hi {name}");
    expect(r.ok).toBe(false);
    expect(r.mismatches.some((m) => m.includes("{count}") && m.includes("missing in the target"))).toBe(true);
  });

  it("flags an extra argument in the target", () => {
    const r = checkIcu("Hi {name}", "Hi {name} {extra}");
    expect(r.mismatches.some((m) => m.includes("{extra}") && m.includes("not in the base"))).toBe(true);
  });

  it("flags an argument type difference", () => {
    const r = checkIcu("{v, number}", "{v, date}");
    expect(r.mismatches.some((m) => m.includes("type differs"))).toBe(true);
  });

  it("flags a plural missing the required 'other' branch", () => {
    const r = checkIcu(
      "{count, plural, one {# item} other {# items}}",
      "{count, plural, one {# artikel}}",
    );
    expect(r.mismatches.some((m) => m.includes("missing the required 'other'"))).toBe(true);
  });

  it("reports malformed input on either side", () => {
    const r = checkIcu("Hi {name", "Hi {name}");
    expect(r.baseMalformed.length).toBeGreaterThan(0);
    expect(r.ok).toBe(false);
  });
});
