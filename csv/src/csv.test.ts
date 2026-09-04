import { test, expect } from "vitest";
import { parse, stringify } from "./index";

test("parse ↔ stringify roundtrip with quoted / embedded specials", () => {
  const rows = [
    { name: "Ada", note: 'says "hi"' },
    { name: "Bob, Jr", note: "line1\nline2" },
  ];
  const csv = stringify(rows);
  const parsed = parse<{ name: string; note: string }>(csv);
  expect(parsed).toEqual(rows);
});

test("stringify quotes fields containing comma, quote or newline", () => {
  const csv = stringify([["a,b", 'c"d', "e\nf"]]);
  expect(csv).toBe('"a,b","c""d","e\nf"');
});

test("parse handles embedded commas, newlines and escaped quotes", () => {
  const csv = 'name,note\r\n"Bob, Jr","he said ""hi""\nbye"';
  const parsed = parse<{ name: string; note: string }>(csv);
  expect(parsed[0]).toEqual({ name: "Bob, Jr", note: 'he said "hi"\nbye' });
});

test("escapeFormulas prefixes dangerous cells; default output unchanged", () => {
  const rows = [["=1+1", "+cmd", "-2", "@ref", "safe"]];
  const dangerous = stringify(rows, { escapeFormulas: true });
  // Each risky cell gets a leading single quote; the '=' / '@' cells also get
  // wrapped in quotes because they now contain a leading quote char? No — the
  // leading "'" itself is not special, so only comma/quote/newline trigger quoting.
  expect(dangerous).toBe("'=1+1,'+cmd,'-2,'@ref,safe");

  // Default (escapeFormulas off) leaves the values byte-identical.
  const plain = stringify(rows);
  expect(plain).toBe("=1+1,+cmd,-2,@ref,safe");
});
