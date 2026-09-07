import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serialize, normalizeFile, sortLocales } from "./sort.js";
import { loadLocales } from "./load.js";
import { parseYaml } from "./readers.js";
import { flatten } from "./flatten.js";
import type { LocaleFile } from "./load.js";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "i18n-sort-"));
}

describe("serialize", () => {
  it("emits sorted, indented JSON with a trailing newline", () => {
    const out = serialize({ "b.x": "2", "a.y": "1" }, "json", 2);
    expect(out).toBe('{\n  "a": {\n    "y": "1"\n  },\n  "b": {\n    "x": "2"\n  }\n}\n');
  });

  it("emits sorted .properties", () => {
    expect(serialize({ b: "2", a: "1" }, "properties", 2)).toBe("a=1\nb=2\n");
  });

  it("emits YAML that round-trips back through the reader", () => {
    const data = { nav: { home: "Home", items: ["one", "two"] }, greet: "Hi {name}" };
    const yaml = serialize(flatten(data), "yaml", 2);
    expect(parseYaml(yaml)).toEqual(data);
  });
});

describe("normalizeFile", () => {
  it("fills missing base keys and prunes extras (dry-run does not write)", () => {
    const dir = tmp();
    const path = join(dir, "ne.json");
    writeFileSync(path, JSON.stringify({ greeting: "Namaste", stale: "old" }));
    const file: LocaleFile = { locale: "ne", namespace: null, path, format: "json", data: flatten({ greeting: "Namaste", stale: "old" }) };
    const base = { greeting: "Hi", bye: "Bye" };

    const r = normalizeFile(file, base, { fill: true, prune: true, fillMarker: "[TODO]" });
    expect(r.added).toEqual(["bye"]);
    expect(r.removed).toEqual(["stale"]);
    expect(r.changed).toBe(true);
    expect(JSON.parse(r.after)).toEqual({ bye: "[TODO]", greeting: "Namaste" });
    // dry-run: original file untouched
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ greeting: "Namaste", stale: "old" });
  });

  it("marks pure reordering as reordered with no add/remove", () => {
    const dir = tmp();
    const path = join(dir, "en.json");
    writeFileSync(path, JSON.stringify({ b: "2", a: "1" }, null, 2) + "\n");
    const file: LocaleFile = { locale: "en", namespace: null, path, format: "json", data: flatten({ b: "2", a: "1" }) };
    const r = normalizeFile(file, null, {});
    expect(r.reordered).toBe(true);
    expect(r.added).toEqual([]);
    expect(r.removed).toEqual([]);
  });
});

describe("sortLocales + write", () => {
  it("normalizes every file and can write to disk", () => {
    const dir = tmp();
    writeFileSync(join(dir, "en.json"), JSON.stringify({ b: "B", a: "A" }));
    writeFileSync(join(dir, "ne.json"), JSON.stringify({ a: "क", extra: "x" }));
    const load = loadLocales(dir);
    const results = sortLocales(load, "en", { fill: true, prune: true });

    const ne = results.find((r) => r.locale === "ne")!;
    expect(ne.added).toEqual(["b"]);
    expect(ne.removed).toEqual(["extra"]);

    for (const r of results.filter((x) => x.changed)) writeFileSync(r.path, r.after);
    expect(JSON.parse(readFileSync(join(dir, "ne.json"), "utf8"))).toEqual({ a: "क", b: "" });
  });
});
