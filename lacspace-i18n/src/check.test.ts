import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check, pickBase, failingCategories } from "./check.js";
import { loadLocales } from "./load.js";
import { renderMarkdown, toJson, renderHuman } from "./report.js";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "i18n-check-"));
}

describe("loadLocales layouts", () => {
  it("loads the flat one-file-per-locale layout", () => {
    const dir = tmp();
    writeFileSync(join(dir, "en.json"), JSON.stringify({ a: { b: "x" }, c: "y" }));
    writeFileSync(join(dir, "ne.json"), JSON.stringify({ a: { b: "क" } }));
    const load = loadLocales(dir);
    expect(load.layout).toBe("flat");
    expect(load.locales.map((l) => l.code)).toEqual(["en", "ne"]);
    expect(load.locales[0]!.flat).toEqual({ "a.b": "x", c: "y" });
  });

  it("loads the namespaced layout and prefixes keys", () => {
    const dir = tmp();
    mkdirSync(join(dir, "en"));
    mkdirSync(join(dir, "ne"));
    writeFileSync(join(dir, "en", "common.json"), JSON.stringify({ ok: "OK" }));
    writeFileSync(join(dir, "ne", "common.json"), JSON.stringify({ ok: "ठिक" }));
    const load = loadLocales(dir);
    expect(load.layout).toBe("namespaced");
    expect(load.locales[0]!.flat).toEqual({ "common:ok": "OK" });
  });

  it("reads YAML and .properties files too", () => {
    const dir = tmp();
    writeFileSync(join(dir, "en.yaml"), "greeting: Hi\nnav:\n  home: Home\n");
    writeFileSync(join(dir, "ne.properties"), "greeting=Namaste\nnav.home=घर\n");
    const load = loadLocales(dir);
    expect(load.locales.find((l) => l.code === "en")!.flat).toEqual({ greeting: "Hi", "nav.home": "Home" });
    expect(load.locales.find((l) => l.code === "ne")!.flat).toEqual({ greeting: "Namaste", "nav.home": "घर" });
  });

  it("throws on an empty/absent directory", () => {
    expect(() => loadLocales(join(tmp(), "nope"))).toThrow();
  });
});

describe("pickBase", () => {
  it("prefers en, else first, else the requested one", () => {
    expect(pickBase(["ne", "en", "fr"])).toBe("en");
    expect(pickBase(["fr", "de"])).toBe("fr");
    expect(pickBase(["en", "fr"], "fr")).toBe("fr");
  });
  it("throws when the requested base is absent", () => {
    expect(() => pickBase(["en"], "zz")).toThrow();
  });
});

describe("check — end to end", () => {
  function fixture(): string {
    const dir = tmp();
    writeFileSync(join(dir, "en.json"), JSON.stringify({
      greeting: "Hi {name}",
      items: "{count, plural, one {# item} other {# items}}",
      bye: "Bye",
    }));
    writeFileSync(join(dir, "ne.json"), JSON.stringify({
      greeting: "Namaste",              // dropped {name}
      items: "{count, plural, other {# items}}",
      bye: "",                          // empty
      stale: "old",                     // extra
    }));
    return dir;
  }

  it("produces coverage, missing/extra/empty and placeholder issues", () => {
    const report = check(fixture(), { base: "en" });
    expect(report.base).toBe("en");
    expect(report.baseTotal).toBe(3);
    const ne = report.locales.find((l) => l.locale === "ne")!;
    expect(ne.empty).toEqual(["bye"]);
    expect(ne.extra).toEqual(["stale"]);
    expect(report.placeholders.some((p) => p.key === "greeting" && p.missing.includes("{name}"))).toBe(true);
    expect(report.problems.icu).toBeGreaterThan(0);
  });

  it("fail-on reports the failing categories", () => {
    const report = check(fixture(), { base: "en" });
    expect(failingCategories(report, ["empty", "icu"]).sort()).toEqual(["empty", "icu"]);
    expect(failingCategories(report, ["dead"])).toEqual([]);
  });

  it("renders markdown and json without throwing", () => {
    const report = check(fixture(), { base: "en" });
    expect(renderMarkdown(report)).toContain("| Locale |");
    expect(toJson(report).base).toBe("en");
    expect(renderHuman(report)).toContain("lacspace-i18n");
  });

  it("runs the code scan when --src is given", () => {
    const dir = fixture();
    const src = join(dir, "src");
    mkdirSync(src);
    writeFileSync(join(src, "app.tsx"), `t("greeting"); t("does.not.exist");`);
    const report = check(dir, { base: "en", src });
    expect(report.code).not.toBeNull();
    expect(report.code!.undefinedKeys).toContain("does.not.exist");
    expect(report.code!.dead).toContain("bye"); // defined, never referenced
  });

  it("ignore list suppresses dead/undefined keys", () => {
    const dir = fixture();
    const src = join(dir, "src");
    mkdirSync(src);
    writeFileSync(join(src, "app.tsx"), `t("greeting");`);
    const report = check(dir, { base: "en", src, ignore: ["bye", "items"] });
    expect(report.code!.dead).not.toContain("bye");
    expect(report.code!.dead).not.toContain("items");
  });
});
