import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectFormat, readRows, serializeRows, convertFile } from "./convert.js";

describe("convert — NDJSON support", () => {
  it("detects ndjson / jsonl extensions", () => {
    expect(detectFormat("leads.ndjson")).toBe("ndjson");
    expect(detectFormat("leads.jsonl")).toBe("ndjson");
  });

  it("serializes rows to one object per line", () => {
    const rows = [{ name: "A", n: 1 }, { name: "B", n: 2 }];
    const out = serializeRows(rows, "ndjson").data as string;
    expect(out).toBe('{"name":"A","n":1}\n{"name":"B","n":2}\n');
    expect(serializeRows([], "ndjson").data).toBe("");
  });

  it("reads NDJSON back, ignoring blank lines", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lac-ndjson-"));
    const src = join(dir, "in.ndjson");
    writeFileSync(src, '{"name":"Cafe","rating":4.5}\n\n{"name":"Bar","rating":4.1}\n');
    const rows = await readRows(src);
    expect(rows.map((r) => r.name)).toEqual(["Cafe", "Bar"]);
  });

  it("throws a helpful error on malformed NDJSON", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lac-ndjson-"));
    const src = join(dir, "bad.ndjson");
    writeFileSync(src, '{"ok":1}\nNOT JSON\n');
    await expect(readRows(src)).rejects.toThrow(/line 2/);
  });

  it("round-trips csv -> ndjson -> csv on disk", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lac-ndjson-"));
    const csv = join(dir, "in.csv");
    writeFileSync(csv, "Name,Rating\nCafe,4.5\nBar,4.1\n");
    const r1 = await convertFile(csv, { out: join(dir, "mid.ndjson") });
    expect(r1.format).toBe("ndjson");
    expect(r1.count).toBe(2);
    const r2 = await convertFile(join(dir, "mid.ndjson"), { out: join(dir, "back.csv") });
    expect(r2.count).toBe(2);
    const back = await readRows(join(dir, "back.csv"));
    expect(back.map((r) => r.Name)).toEqual(["Cafe", "Bar"]);
  });
});
