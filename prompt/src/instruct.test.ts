import { test, expect } from "vitest";
import { jsonInstruction, enumInstruction } from "./index";

test("jsonInstruction() defaults to strict object output", () => {
  const out = jsonInstruction();
  expect(out).toBe(
    "Respond with a single valid JSON object and nothing else — no prose, no explanation, no Markdown code fences.",
  );
});

test("jsonInstruction() includes a pretty-printed shape and detects arrays", () => {
  const out = jsonInstruction({ shape: [{ id: 1 }] });
  expect(out).toContain("single valid JSON array");
  expect(out).toContain('Match this shape:\n[\n  {\n    "id": 1\n  }\n]');
});

test("jsonInstruction({ strict:false }) allows surrounding prose", () => {
  const out = jsonInstruction({ strict: false });
  expect(out).toBe("Respond with a single valid JSON object.");
});

test("enumInstruction() lists allowed values and constrains output", () => {
  const out = enumInstruction(["positive", "neutral", "negative"]);
  expect(out).toBe(
    "Respond with exactly one of the following values: positive | neutral | negative.\nOutput only the value, with no other text.",
  );
});

test("enumInstruction() honours custom separator/label and strict:false", () => {
  const out = enumInstruction([1, 2, 3], {
    separator: ", ",
    label: "Pick one",
    strict: false,
  });
  expect(out).toBe("Pick one: 1, 2, 3.");
});

test("enumInstruction() throws on an empty value list", () => {
  expect(() => enumInstruction([])).toThrow(/at least one value/);
});
