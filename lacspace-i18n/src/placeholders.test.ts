import { describe, it, expect } from "vitest";
import { extractPlaceholders, checkPlaceholders } from "./placeholders.js";

function tokens(s: string): string[] {
  return [...extractPlaceholders(s).tokens].sort();
}

describe("extractPlaceholders — syntaxes", () => {
  it("single-brace", () => {
    expect(tokens("Hi {name}, you have {count} messages")).toEqual(["{count}", "{name}"]);
  });
  it("double-brace (i18next)", () => {
    expect(tokens("Hi {{name}}")).toEqual(["{{name}}"]);
  });
  it("printf positional and simple", () => {
    expect(tokens("%s scored %d, %1$s wins")).toEqual(["%1$s", "%d", "%s"]);
  });
  it("ignores %% literal", () => {
    expect(tokens("100%% done by %s")).toEqual(["%s"]);
  });
  it("ICU plural records the arg and nested placeholders", () => {
    const t = tokens("{count, plural, one {# item for {name}} other {# items}}");
    expect(t).toContain("{count,plural}");
    expect(t).toContain("{name}");
  });
  it("ICU select", () => {
    expect(tokens("{gender, select, male {he} female {she} other {they}}")).toEqual(["{gender,select}"]);
  });
  it("ICU number/date arguments", () => {
    expect(tokens("Total {amount, number, currency}")).toEqual(["{amount,number}"]);
  });
});

describe("extractPlaceholders — errors", () => {
  it("flags unbalanced single brace", () => {
    expect(extractPlaceholders("Hi {name").errors.length).toBeGreaterThan(0);
  });
  it("flags a stray closing brace", () => {
    expect(extractPlaceholders("Hi name}").errors).toContain("unexpected '}'");
  });
  it("flags unbalanced double brace", () => {
    expect(extractPlaceholders("Hi {{name").errors.length).toBeGreaterThan(0);
  });
  it("flags an unknown plural category", () => {
    const e = extractPlaceholders("{n, plural, one {a} lots {b} other {c}}").errors;
    expect(e.some((x) => x.includes("lots"))).toBe(true);
  });
  it("accepts explicit =N plural categories", () => {
    expect(extractPlaceholders("{n, plural, =0 {none} one {one} other {many}}").errors).toEqual([]);
  });
  it("flags an unknown ICU type", () => {
    expect(extractPlaceholders("{x, bogus, a {b}}").errors.some((e) => e.includes("bogus"))).toBe(true);
  });
});

describe("checkPlaceholders — cross locale", () => {
  const base = { greet: "Hi {name}", n: "{count, plural, one {# item} other {# items}}" };
  it("flags a locale that drops a placeholder", () => {
    const r = checkPlaceholders(base, [
      { code: "en", flat: base },
      { code: "ne", flat: { greet: "Namaste", n: "{count, plural, one {# item} other {# items}}" } },
    ], "en");
    const issue = r.issues.find((i) => i.key === "greet" && i.locale === "ne");
    expect(issue?.missing).toEqual(["{name}"]);
  });

  it("flags an extra placeholder", () => {
    const r = checkPlaceholders(base, [
      { code: "en", flat: base },
      { code: "de", flat: { greet: "Hallo {name} {extra}", n: base.n } },
    ], "en");
    const issue = r.issues.find((i) => i.locale === "de");
    expect(issue?.extra).toEqual(["{extra}"]);
  });

  it("collects malformed ICU from any locale", () => {
    const r = checkPlaceholders(base, [
      { code: "en", flat: base },
      { code: "fr", flat: { greet: "Salut {name", n: base.n } },
    ], "en");
    expect(r.malformed.some((m) => m.locale === "fr" && m.key === "greet")).toBe(true);
  });

  it("no issues when placeholders match", () => {
    const r = checkPlaceholders(base, [
      { code: "en", flat: base },
      { code: "es", flat: { greet: "Hola {name}", n: base.n } },
    ], "en");
    expect(r.issues).toEqual([]);
  });
});
