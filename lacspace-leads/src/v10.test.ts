import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLiveWriter } from "./live.js";
import { readRows } from "./convert.js";
import { rowsToLeads } from "./export.js";
import type { Lead, LeadField } from "./types.js";

const dir = mkdtempSync(join(tmpdir(), "leads-live-"));
const fields: LeadField[] = ["name", "phone", "website", "rating", "categories"];
const L = (i: number): Lead => ({ name: `Cafe ${i}, "Thamel"`, phone: `+97798000000${i}`, website: `https://cafe${i}.com.np`, rating: 4 + i / 10, categories: ["Cafe", "Bakery"] });

describe("live writer (1.8.0)", () => {
  for (const format of ["csv", "ndjson", "json", "xlsx"] as const) {
    it(`${format}: the file is complete and readable after every single row`, async () => {
      const file = join(dir, `live.${format}`);
      const w = createLiveWriter({ file, format, fields });
      expect(existsSync(file)).toBe(true);
      for (let i = 1; i <= 5; i++) {
        expect(w.add(L(i))).toBe(true);
        const back = rowsToLeads(await readRows(file));
        expect(back).toHaveLength(i);
        expect(back[i - 1]!.name).toBe(`Cafe ${i}, "Thamel"`);
        expect(back[i - 1]!.phone?.replace(/^'/, "")).toBe(`+97798000000${i}`); // CSV guards a leading + against formula injection
      }
      if (format === "json") expect(() => JSON.parse(readFileSync(file, "utf8"))).not.toThrow();
      w.finish([...w.leads].reverse());
      const final = rowsToLeads(await readRows(file));
      expect(final.map((l) => l.name)).toEqual([5, 4, 3, 2, 1].map((i) => `Cafe ${i}, "Thamel"`));
    });
  }
  it("skips duplicates and keeps seeded rows (append / resume)", async () => {
    const file = join(dir, "seed.csv");
    const w = createLiveWriter({ file, format: "csv", fields, seed: [L(1), L(2)] });
    expect((await readRows(file)).length).toBe(2);
    expect(w.add({ ...L(2), name: "Same website" })).toBe(false);
    expect(w.add(L(3))).toBe(true);
    expect(w.count).toBe(3);
    expect(w.added).toBe(1);
    expect((await readRows(file)).length).toBe(3);
  });
  it("neutralises spreadsheet formulas in live CSV rows", () => {
    const file = join(dir, "formula.csv");
    const w = createLiveWriter({ file, format: "csv", fields: ["name"] });
    w.add({ name: "=HYPERLINK(\"http://x\")" });
    expect(readFileSync(file, "utf8")).not.toMatch(/^=HYPERLINK/m);
  });
  it("streams csv / ndjson to stdout and refuses json/xlsx there", () => {
    let out = "";
    const w = createLiveWriter({ file: "-", format: "ndjson", fields, stdout: { write: (c: string) => (out += c) } });
    w.add(L(1));
    w.add(L(2));
    expect(out.trim().split("\n").map((l) => JSON.parse(l).name)).toEqual(['Cafe 1, "Thamel"', 'Cafe 2, "Thamel"']);
    expect(() => createLiveWriter({ file: "-", format: "xlsx", fields })).toThrow(/csv or ndjson/);
  });
  it("an empty run leaves a valid empty file", async () => {
    const j = join(dir, "empty.json");
    createLiveWriter({ file: j, format: "json", fields }).finish([]);
    expect(JSON.parse(readFileSync(j, "utf8"))).toEqual([]);
    const c = join(dir, "empty.csv");
    createLiveWriter({ file: c, format: "csv", fields }).finish([]);
    expect(readFileSync(c, "utf8").trim()).toBe("Name,Phone,Website,Rating,Categories");
  });
});
