import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergeLocale, syncLocales, isMarker, DEFAULT_MARKER } from "./sync.js";
import { loadLocales } from "./load.js";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "i18n-sync-"));
}

describe("mergeLocale", () => {
  const base = { a: "A", b: "B", c: "C" };

  it("fills missing keys with the default marker and keeps existing translations", () => {
    const r = mergeLocale(base, { a: "क", c: "" });
    expect(r.merged).toEqual({ a: "क", b: DEFAULT_MARKER, c: "" });
    expect(r.added).toEqual(["b"]);
    expect(r.kept).toBe(2); // a and c both present in target
  });

  it("never overwrites an existing translation", () => {
    const r = mergeLocale(base, { a: "existing", b: "keep", c: "me" });
    expect(r.merged).toEqual({ a: "existing", b: "keep", c: "me" });
    expect(r.added).toEqual([]);
  });

  it("fills from the base value with fromBase", () => {
    const r = mergeLocale(base, { a: "क" }, { fromBase: true });
    expect(r.merged).toEqual({ a: "क", b: "B", c: "C" });
  });

  it("honours a custom marker", () => {
    const r = mergeLocale(base, {}, { marker: "[TODO]" });
    expect(r.merged).toEqual({ a: "[TODO]", b: "[TODO]", c: "[TODO]" });
  });

  it("preserves base key order regardless of target order", () => {
    const r = mergeLocale({ z: "Z", m: "M", a: "A" }, { a: "1", z: "2" });
    expect(Object.keys(r.merged)).toEqual(["z", "m", "a"]);
  });

  it("keeps extra keys by default and drops them with prune", () => {
    const kept = mergeLocale(base, { a: "1", stale: "x" });
    expect(kept.merged.stale).toBe("x");
    const pruned = mergeLocale(base, { a: "1", stale: "x" }, { prune: true });
    expect("stale" in pruned.merged).toBe(false);
    expect(pruned.removed).toEqual(["stale"]);
  });
});

describe("isMarker", () => {
  it("recognises the default and custom markers", () => {
    expect(isMarker(DEFAULT_MARKER)).toBe(true);
    expect(isMarker("real")).toBe(false);
    expect(isMarker("[TODO]", "[TODO]")).toBe(true);
  });
});

describe("syncLocales", () => {
  it("produces filled targets without writing, and never loses translations", () => {
    const dir = tmp();
    writeFileSync(join(dir, "en.json"), JSON.stringify({ greeting: "Hi", bye: "Bye" }));
    writeFileSync(join(dir, "ne.json"), JSON.stringify({ greeting: "Namaste" }));
    const load = loadLocales(dir);

    const results = syncLocales(load, "en");
    const ne = results.find((r) => r.locale === "ne")!;
    expect(ne.added).toEqual(["bye"]);
    expect(JSON.parse(ne.after)).toEqual({ bye: DEFAULT_MARKER, greeting: "Namaste" });
    // dry-run: file untouched
    expect(JSON.parse(readFileSync(join(dir, "ne.json"), "utf8"))).toEqual({ greeting: "Namaste" });
  });

  it("does not sync the base locale itself", () => {
    const dir = tmp();
    writeFileSync(join(dir, "en.json"), JSON.stringify({ a: "A" }));
    writeFileSync(join(dir, "fr.json"), JSON.stringify({ a: "A" }));
    const results = syncLocales(loadLocales(dir), "en");
    expect(results.every((r) => r.locale !== "en")).toBe(true);
  });
});
