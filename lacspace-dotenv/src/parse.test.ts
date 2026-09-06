import { describe, it, expect } from "vitest";
import { parseEnv } from "./parse.js";

describe("parseEnv", () => {
  it("parses basic KEY=VALUE, export, and empty values", () => {
    const { map, errors } = parseEnv("export API_KEY=abc\nPORT=3000\nEMPTY=\n");
    expect(map).toEqual({ API_KEY: "abc", PORT: "3000", EMPTY: "" });
    expect(errors).toEqual([]);
  });

  it("handles double quotes with escapes", () => {
    const { map } = parseEnv('MSG="hello\\nworld\\t!"\n');
    expect(map.MSG).toBe("hello\nworld\t!");
  });

  it("handles single quotes literally", () => {
    const { map } = parseEnv("RAW='no \\n escapes here'\n");
    expect(map.RAW).toBe("no \\n escapes here");
  });

  it("keeps '=' inside values", () => {
    const { map } = parseEnv("DB=postgres://u:p@h:5432/db?ssl=true\n");
    expect(map.DB).toBe("postgres://u:p@h:5432/db?ssl=true");
  });

  it("strips full-line and trailing comments (unquoted only)", () => {
    const { map } = parseEnv("# a comment\nHOST=localhost # inline comment\nHASH=a#b\n");
    expect(map).toEqual({ HOST: "localhost", HASH: "a#b" });
  });

  it("does not strip '#' inside a quoted value", () => {
    const { map } = parseEnv('TOKEN="a #b"\n');
    expect(map.TOKEN).toBe("a #b");
  });

  it("supports multiline double-quoted values", () => {
    const { map } = parseEnv('KEY="line1\nline2"\nNEXT=ok\n');
    expect(map.KEY).toBe("line1\nline2");
    expect(map.NEXT).toBe("ok");
  });

  it("records line numbers and last-wins for duplicates", () => {
    const { entries, map } = parseEnv("A=1\nB=2\nA=3\n");
    expect(entries.map((e) => [e.key, e.line])).toEqual([["A", 1], ["B", 2], ["A", 3]]);
    expect(map.A).toBe("3");
  });

  it("reports syntax errors with line numbers", () => {
    const { errors } = parseEnv("GOOD=1\nnot a pair\n=novalue\n");
    expect(errors.map((e) => e.line)).toEqual([2, 3]);
  });

  it("trims surrounding whitespace on unquoted values", () => {
    const { map } = parseEnv("KEY=  spaced   \n");
    expect(map.KEY).toBe("spaced");
  });
});
