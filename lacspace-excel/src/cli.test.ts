import { test, expect, describe, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWorkbook } from "@lacspace/xlsx";
import { main, parseArgs, VERSION, type CliIO } from "./cli";

interface Run { code: number; stdout: string; stderr: string }

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "lacspace-excel-cli-"));
  writeFileSync(join(dir, "sample.json"), JSON.stringify([
    { sku: "A-1", qty: 2, rate: 5.5, customer: { name: "Ada", city: "Lisbon" } },
    { sku: "B-2", qty: 1, rate: 12, customer: { name: "Ivy", city: "Oslo" } },
    { sku: "A-1", qty: 2, rate: 5.5, customer: { name: "Ada", city: "Lisbon" } },
  ]));
  writeFileSync(join(dir, "people.csv"), "name,age\nAda,36\nIvy,19\n");
});

afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

async function run(argv: string[], stdin?: string | Uint8Array): Promise<Run> {
  let stdout = "";
  let stderr = "";
  const io: Partial<CliIO> = {
    out: (s) => { stdout += s; },
    err: (s) => { stderr += s; },
    readStdin: () => (stdin === undefined ? null : typeof stdin === "string" ? new TextEncoder().encode(stdin) : stdin),
    color: false,
    cwd: dir,
  };
  const code = await main(argv, io);
  return { code, stdout, stderr };
}

describe("cli", () => {
  test("--help prints usage with every command and exits 0", async () => {
    const r = await run(["--help"]);
    expect(r.code).toBe(0);
    for (const cmd of ["convert", "inspect", "formula", "template", "dedupe", "split", "merge", "functions"]) expect(r.stdout).toContain(cmd);
    expect(r.stdout).toContain("lacspace-excel");
    expect(r.stdout).not.toContain("\x1b[");
    expect((await run([])).code).toBe(0);
  });

  test("--version prints the package.json version", async () => {
    const r = await run(["--version"]);
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
    expect(r.stdout.trim()).toBe(pkg.version);
    expect(VERSION).toBe(pkg.version);
    expect(r.code).toBe(0);
  });

  test("convert to stdout (csv) with --flatten and a summary on stderr", async () => {
    const r = await run(["convert", "sample.json", "--to", "csv", "--flatten"]);
    expect(r.code).toBe(0);
    const lines = r.stdout.trim().split("\n");
    expect(lines[0]).toBe("sku,qty,rate,customer.name,customer.city");
    expect(lines).toHaveLength(4);
    expect(r.stderr).toMatch(/✓ 3 rows → stdout \(csv, [\d.]+ (B|KB)\)/);
  });

  test("convert from stdin ('-') sniffs csv and writes json", async () => {
    const r = await run(["convert", "-", "--to", "json"], "a,b\n1,2\n");
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([{ a: 1, b: 2 }]);
  });

  test("convert to xlsx without -o exits 1 with a clear error", async () => {
    const r = await run(["convert", "sample.json", "--to", "xlsx"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/needs -o/);
    expect(r.stdout).toBe("");
  });

  test("convert -o file.xlsx infers the format, writes the file and reports its size", async () => {
    const r = await run(["convert", "sample.json", "-o", "out/sample.xlsx", "--flatten", "--rename", "sku=code"]);
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/✓ 3 rows → out\/sample\.xlsx \([\d.]+ KB\)/);
    const wb = await readWorkbook(new Uint8Array(readFileSync(join(dir, "out/sample.xlsx"))));
    expect(wb.sheets[0]!.name).toBe("Sheet1");
    const back = await run(["convert", "out/sample.xlsx", "--to", "json"]);
    const rows = JSON.parse(back.stdout) as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ code: "A-1", qty: 2, "customer.city": "Lisbon" });
  });

  test("inspect prints types, nullable flags and samples; --json is machine readable", async () => {
    const r = await run(["inspect", "people.csv"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/2 rows × 2 columns/);
    expect(r.stdout).toMatch(/name\s+string/);
    expect(r.stdout).toMatch(/age\s+number/);
    expect(r.stdout).toContain("| Ada | 36 |");
    const j = await run(["inspect", "people.csv", "--json"]);
    const report = JSON.parse(j.stdout) as { tables: { rows: number; columns: { name: string; type: string; nullable: boolean }[]; sample: unknown[] }[] };
    expect(report.tables[0]!.rows).toBe(2);
    expect(report.tables[0]!.columns[1]).toMatchObject({ name: "age", type: "number", nullable: false });
    expect(report.tables[0]!.sample).toHaveLength(2);
  });

  test("formula adds chained columns and keeps the input format", async () => {
    const r = await run(["formula", "sample.json", "--add", "amount=qty*rate", "--add", "tax=ROUND(amount*0.1,2)"]);
    expect(r.code).toBe(0);
    const rows = JSON.parse(r.stdout) as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ amount: 11, tax: 1.1 });
    expect(rows[1]).toMatchObject({ amount: 12, tax: 1.2 });
    expect(r.stderr).toMatch(/\+2 columns \(amount, tax\)/);
  });

  test("formula with a syntax error exits 1 before reading the input", async () => {
    const r = await run(["formula", "does-not-exist.json", "--add", "x=qty ) rate"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/Invalid formula for "x" at position \d+/);
    expect((await run(["formula", "sample.json"])).code).toBe(1);
  });

  test("template list (text + --json) and template <id> -o", async () => {
    const list = await run(["template", "list"]);
    expect(list.code).toBe(0);
    expect(list.stdout).toContain("invoice");
    expect(list.stdout).toContain("loan-schedule");
    const j = await run(["template", "list", "--json"]);
    const items = JSON.parse(j.stdout) as { id: string; name: string; category: string; description: string }[];
    expect(items).toHaveLength(17);
    expect(items[0]).toHaveProperty("category");

    const built = await run(["template", "invoice", "-o", "tpl/invoice.xlsx", "--blank-rows", "3"]);
    expect(built.code).toBe(0);
    expect(built.stderr).toMatch(/Invoice template → tpl\/invoice\.xlsx/);
    expect(existsSync(join(dir, "tpl/invoice.xlsx"))).toBe(true);

    const csv = await run(["template", "budget", "--to", "csv"]);
    expect(csv.code).toBe(0);
    expect(csv.stdout.split("\n")[0]).toContain("category");

    expect((await run(["template", "nope"])).code).toBe(1);
  });

  test("dedupe by key drops later duplicates and reports the count", async () => {
    const r = await run(["dedupe", "sample.json", "--by", "sku"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toHaveLength(2);
    expect(r.stderr).toMatch(/✓ removed 1 duplicate/);
  });

  test("split writes one file per sheet and merge rebuilds the workbook", async () => {
    const s = await run(["split", "tpl/invoice.xlsx", "--out-dir", "sheets", "--to", "csv"]);
    expect(s.code).toBe(0);
    const files = s.stdout.trim().split("\n");
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const f of files) expect(existsSync(join(dir, f))).toBe(true);
    expect(readdirSync(join(dir, "sheets")).every((f) => f.endsWith(".csv"))).toBe(true);

    const m = await run(["merge", "sheets/*.csv", "people.csv", "-o", "merged.xlsx"]);
    expect(m.code).toBe(0);
    const wb = await readWorkbook(new Uint8Array(readFileSync(join(dir, "merged.xlsx"))));
    expect(wb.sheets.map((x) => x.name)).toContain("people");
    expect(wb.sheets.length).toBe(files.length + 1);
    expect((await run(["merge", "people.csv"])).code).toBe(1);
  });

  test("functions lists all and describes one; unknown name exits 1", async () => {
    const all = await run(["functions"]);
    expect(all.code).toBe(0);
    expect(all.stdout).toMatch(/math \(\d+\)/);
    expect(all.stdout).toContain("SUMIF");
    const one = await run(["functions", "SUMIF"]);
    expect(one.code).toBe(0);
    expect(one.stdout).toMatch(/◆ SUMIF/);
    expect(one.stdout).toMatch(/Signature\s+SUMIF\(/);
    const j = await run(["functions", "sumif", "--json"]);
    expect(JSON.parse(j.stdout)).toMatchObject({ name: "SUMIF" });
    expect((await run(["functions", "NOPE"])).code).toBe(1);
  });

  test("unknown command / flag / missing file exit 1 with a message on stderr", async () => {
    const r = await run(["frobnicate", "x.json"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/Unknown command "frobnicate"/);
    expect((await run(["convert", "sample.json", "--bogus"])).stderr).toMatch(/Unknown flag/);
    expect((await run(["convert", "missing.json"])).stderr).toMatch(/Cannot read "missing.json"/);
    expect((await run(["convert"])).stderr).toMatch(/No input given/);
  });

  test("parseArgs handles --flag=value, repeated --add, lists and maps", () => {
    const a = parseArgs(["convert", "in.csv", "--to=yaml", "--columns", "a, b", "--rename", "a=x,b=y", "--add", "p=1", "--add", "q=p+1", "--sheet", "2", "--by", "a", "--by", "b"]);
    expect(a.positional).toEqual(["convert", "in.csv"]);
    expect(a.to).toBe("yaml");
    expect(a.columns).toEqual(["a", "b"]);
    expect(a.rename).toEqual({ a: "x", b: "y" });
    expect(a.adds).toEqual(["p=1", "q=p+1"]);
    expect(a.sheet).toBe("2");
    expect(a.by).toEqual(["a", "b"]);
    expect(() => parseArgs(["--to", "docx"])).toThrow(/Unknown format/);
    expect(() => parseArgs(["--blank-rows", "-1"])).toThrow(/whole number/);
  });
});
