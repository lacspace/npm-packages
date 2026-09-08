import { test, expect } from "vitest";
import { buildContext, buildPrompt, DEFAULT_SYSTEM } from "./index";
import type { RetrievedChunk } from "./index";

const chunks: RetrievedChunk[] = [
  { id: "a", text: "Alpha content.", score: 0.9, metadata: { source: "doc-a" } },
  { id: "b", text: "Beta content.", score: 0.8, metadata: { source: "doc-b" } },
  { id: "c", text: "Gamma content.", score: 0.7 },
];

test("buildContext joins blocks with the default separator", () => {
  expect(buildContext(chunks)).toBe("Alpha content.\n\nBeta content.\n\nGamma content.");
});

test("buildContext uses a custom separator", () => {
  expect(buildContext(chunks, { separator: " --- " })).toBe(
    "Alpha content. --- Beta content. --- Gamma content.",
  );
});

test("buildContext of no chunks is empty", () => {
  expect(buildContext([])).toBe("");
});

test("buildContext withSources prefixes each block", () => {
  const out = buildContext(chunks, { withSources: true });
  expect(out).toContain("[Source: doc-a]\nAlpha content.");
  expect(out).toContain("[Source: doc-b]\nBeta content.");
  // Falls back to the id when no metadata.source.
  expect(out).toContain("[Source: c]\nGamma content.");
});

test("buildContext supports a custom template", () => {
  const out = buildContext(chunks, {
    template: (c, i) => `${i + 1}. ${c.text} (${c.score})`,
  });
  expect(out).toBe("1. Alpha content. (0.9)\n\n2. Beta content. (0.8)\n\n3. Gamma content. (0.7)");
});

test("buildContext drops trailing blocks that exceed maxChars", () => {
  const out = buildContext(chunks, { maxChars: 20 });
  expect(out).toBe("Alpha content.");
  expect(out.length).toBeLessThanOrEqual(20);
});

test("buildContext truncates a single oversized first block to maxChars", () => {
  const big: RetrievedChunk[] = [{ id: "x", text: "x".repeat(100), score: 1 }];
  const out = buildContext(big, { maxChars: 10 });
  expect(out).toHaveLength(10);
});

test("buildContext with maxChars 0 is empty", () => {
  expect(buildContext(chunks, { maxChars: 0 })).toBe("");
});

test("buildPrompt returns all four parts", () => {
  const built = buildPrompt("What is alpha?", chunks);
  expect(built.system).toBe(DEFAULT_SYSTEM);
  expect(built.question).toBe("What is alpha?");
  expect(built.context).toContain("Alpha content.");
  expect(built.prompt).toContain(DEFAULT_SYSTEM);
  expect(built.prompt).toContain("Question: What is alpha?");
  expect(built.prompt).toContain("Answer:");
});

test("buildPrompt accepts a custom system instruction", () => {
  const built = buildPrompt("Q", chunks, { system: "Be terse." });
  expect(built.system).toBe("Be terse.");
  expect(built.prompt.startsWith("Be terse.")).toBe(true);
});

test("buildPrompt forwards context options (maxChars)", () => {
  const built = buildPrompt("Q", chunks, { maxChars: 20 });
  expect(built.context).toBe("Alpha content.");
});

test("buildPrompt supports a custom promptTemplate", () => {
  const built = buildPrompt("Q", chunks, {
    promptTemplate: ({ context, question }) => `${context}\n>>> ${question}`,
  });
  expect(built.prompt).toBe(`${built.context}\n>>> Q`);
});
