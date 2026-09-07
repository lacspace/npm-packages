import { describe, it, expect } from "vitest";
import { parseBatch, parseCsvLine, safeFilename } from "./batch.js";

describe("parseCsvLine", () => {
  it("splits plain fields", () => {
    expect(parseCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("keeps commas inside quotes", () => {
    expect(parseCsvLine('id,"a, b, c",x')).toEqual(["id", "a, b, c", "x"]);
  });

  it("handles escaped double quotes", () => {
    expect(parseCsvLine('"say ""hi""",2')).toEqual(['say "hi"', "2"]);
  });
});

describe("parseBatch — txt", () => {
  it("numbers each non-empty line", () => {
    const rows = parseBatch("https://a.com\n\nhttps://b.com\n", "txt");
    expect(rows).toEqual([
      { id: "1", data: "https://a.com" },
      { id: "2", data: "https://b.com" },
    ]);
  });
});

describe("parseBatch — csv", () => {
  it("uses id + data header columns", () => {
    const rows = parseBatch("id,url\nhome,https://a.com\nwork,https://b.com\n", "csv");
    expect(rows).toEqual([
      { id: "home", data: "https://a.com" },
      { id: "work", data: "https://b.com" },
    ]);
  });

  it("recognises a data column in any position", () => {
    const rows = parseBatch("name,text\nfoo,hello\n", "csv");
    expect(rows).toEqual([{ id: "foo", data: "hello" }]);
  });

  it("treats a 2-column headerless file as id,data", () => {
    const rows = parseBatch("home,https://a.com\nwork,https://b.com\n", "csv");
    expect(rows).toEqual([
      { id: "home", data: "https://a.com" },
      { id: "work", data: "https://b.com" },
    ]);
  });

  it("uses line numbers for a single-column file", () => {
    const rows = parseBatch("https://a.com\nhttps://b.com\n", "csv");
    expect(rows).toEqual([
      { id: "1", data: "https://a.com" },
      { id: "2", data: "https://b.com" },
    ]);
  });

  it("skips rows with empty data", () => {
    const rows = parseBatch("id,url\na,\nb,https://b.com\n", "csv");
    expect(rows).toEqual([{ id: "b", data: "https://b.com" }]);
  });
});

describe("safeFilename", () => {
  it("sanitises unsafe characters", () => {
    expect(safeFilename("a/b c?.txt")).toBe("a_b_c_.txt");
    expect(safeFilename("https://x.com")).toBe("https_x.com");
    expect(safeFilename("")).toBe("qr");
  });
});
