import { test, expect } from "vitest";
import { diagnoseJson, repairJsonWithDiagnostics } from "./index";

function kinds(input: string): string[] {
  return diagnoseJson(input).map((i) => i.kind).sort();
}

test("diagnoseJson: valid JSON reports no issues", () => {
  expect(diagnoseJson('{"a":1,"b":[2,3],"c":"ok"}')).toEqual([]);
});

test("diagnoseJson: detects trailing commas", () => {
  expect(kinds('{"a":1,"b":2,}')).toContain("trailing-comma");
  expect(kinds("[1, 2, 3, ]")).toContain("trailing-comma");
});

test("diagnoseJson: detects single quotes and unquoted keys", () => {
  expect(kinds("{name: 'Ada'}")).toEqual(["single-quotes", "unquoted-keys"]);
});

test("diagnoseJson: detects python literals and non-finite numbers", () => {
  const k = kinds('{"a":True,"b":None,"c":NaN,"d":Infinity}');
  expect(k).toContain("python-literals");
  expect(k).toContain("non-finite");
});

test("diagnoseJson: detects comments", () => {
  expect(kinds('{ // hi\n"a":1 /* x */ }')).toContain("comments");
});

test("diagnoseJson: detects an unterminated string (truncation)", () => {
  expect(kinds('{"note":"hello wor')).toContain("unterminated-string");
});

test("diagnoseJson: detects an unclosed structure (truncation)", () => {
  expect(kinds('{"a":1,"b":{"c":2')).toContain("unclosed-structure");
});

test("diagnoseJson: detects JSON wrapped in prose / a fence", () => {
  expect(kinds('Here you go:\n```json\n{"a":1,}\n```')).toContain(
    "wrapped-in-text",
  );
});

test("diagnoseJson: a brace inside a string is not a false trailing comma", () => {
  expect(diagnoseJson('{"msg":"a, }"}')).toEqual([]);
});

test("diagnoseJson: lowercase true/false/null and numbers are not flagged as keys", () => {
  // Valid except for the trailing comma → only that one issue.
  expect(kinds('{"a":true,"b":null,"c":1.5e3,}')).toEqual(["trailing-comma"]);
});

test("repairJsonWithDiagnostics: repairs and reports on messy input", () => {
  const r = repairJsonWithDiagnostics("{ name: 'Ada', }");
  expect(r.output).toBe('{"name":"Ada"}');
  expect(r.valid).toBe(false);
  expect(r.changed).toBe(true);
  expect(r.issues.map((i) => i.kind).sort()).toEqual([
    "single-quotes",
    "trailing-comma",
    "unquoted-keys",
  ]);
});

test("repairJsonWithDiagnostics: valid input is unchanged with no issues", () => {
  const valid = '{"a":1,"b":[2,3]}';
  const r = repairJsonWithDiagnostics(valid);
  expect(r.output).toBe(valid);
  expect(r.valid).toBe(true);
  expect(r.changed).toBe(false);
  expect(r.issues).toEqual([]);
});

test("repairJsonWithDiagnostics: every issue carries a message string", () => {
  const r = repairJsonWithDiagnostics("{a: True,}");
  expect(r.issues.length).toBeGreaterThan(0);
  for (const issue of r.issues) {
    expect(typeof issue.message).toBe("string");
    expect(issue.message.length).toBeGreaterThan(0);
  }
});
