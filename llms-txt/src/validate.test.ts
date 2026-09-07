import { test, expect } from "vitest";
import { validateLlmsTxt, llmsTxt } from "./index";

test("validateLlmsTxt passes a well-formed document", () => {
  const txt = llmsTxt({
    title: "Acme",
    summary: "Acme docs.",
    sections: [{ title: "Docs", links: [{ title: "API", url: "https://acme.com/api" }] }],
  });
  const res = validateLlmsTxt(txt);
  expect(res.valid).toBe(true);
  expect(res.issues).toHaveLength(0);
});

test("validateLlmsTxt errors when the H1 is missing", () => {
  const res = validateLlmsTxt("> just a summary\n\n## Docs\n");
  expect(res.valid).toBe(false);
  expect(res.issues.some((i) => i.level === "error" && /H1/.test(i.message))).toBe(true);
});

test("validateLlmsTxt warns on a missing summary but stays valid", () => {
  const res = validateLlmsTxt("# Acme\n\n## Docs\n");
  expect(res.valid).toBe(true);
  expect(res.issues.some((i) => i.level === "warning" && /summary/.test(i.message))).toBe(true);
});

test("validateLlmsTxt warns on a malformed link line", () => {
  const res = validateLlmsTxt("# Acme\n\n> s\n\n## Docs\n\n- [broken](no-close\n");
  expect(res.issues.some((i) => i.level === "warning" && i.line === 7)).toBe(true);
});

test("validateLlmsTxt warns on multiple H1 titles", () => {
  const res = validateLlmsTxt("# One\n\n> s\n\n# Two\n");
  expect(res.issues.some((i) => /exactly one/.test(i.message))).toBe(true);
});

test("validateLlmsTxt warns when the H1 is not the first line", () => {
  const res = validateLlmsTxt("intro line\n\n# Acme\n\n> s\n");
  expect(res.issues.some((i) => /first line/.test(i.message))).toBe(true);
});
