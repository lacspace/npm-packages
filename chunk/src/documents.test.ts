import { test, expect } from "vitest";
import { splitDocuments, splitMarkdown } from "./index";

test("splitDocuments chunks a corpus and tags each chunk", () => {
  const out = splitDocuments(
    [
      { id: "a", text: "alpha ".repeat(60) },
      { id: "b", text: "beta ".repeat(60) },
    ],
    { chunkSize: 100, chunkOverlap: 0 },
  );
  expect(out.length).toBeGreaterThan(2);
  // Global index is contiguous.
  expect(out.map((c) => c.index)).toEqual(out.map((_, i) => i));
  // Every chunk knows its doc and its within-doc position.
  const fromA = out.filter((c) => c.docId === "a");
  const fromB = out.filter((c) => c.docId === "b");
  expect(fromA.length).toBeGreaterThan(0);
  expect(fromB.length).toBeGreaterThan(0);
  expect(fromA.map((c) => c.docIndex)).toEqual(fromA.map((_, i) => i));
});

test("splitDocuments accepts plain strings and defaults ids to array index", () => {
  const out = splitDocuments(["hello world", "second doc here"], {
    chunkSize: 100,
    chunkOverlap: 0,
  });
  expect(out[0]!.docId).toBe("0");
  expect(out.find((c) => c.text.includes("second"))!.docId).toBe("1");
});

test("splitDocuments carries document metadata onto chunks", () => {
  const out = splitDocuments(
    [{ id: "d1", text: "some content that is here", metadata: { source: "wiki", lang: "en" } }],
    { chunkSize: 100, chunkOverlap: 0 },
  );
  expect(out[0]!.metadata).toEqual({ source: "wiki", lang: "en" });
});

test("splitDocuments offsets remain relative to each document", () => {
  const doc = "first sentence. second sentence. third sentence.";
  const out = splitDocuments([{ id: "x", text: doc }], { chunkSize: 20, chunkOverlap: 0 });
  for (const c of out) {
    expect(doc.slice(c.start, c.end)).toBe(c.text);
  }
});

test("splitDocuments supports an injected splitter (markdown)", () => {
  const md = "# Title\n\nBody text under the heading goes here.";
  const out = splitDocuments([{ id: "m", text: md }], { splitter: splitMarkdown, chunkSize: 200 });
  expect(out.length).toBeGreaterThan(0);
  expect(out[0]!.text).toContain("# Title");
  expect(out[0]!.docId).toBe("m");
});

test("splitDocuments handles empty docs list and empty text", () => {
  expect(splitDocuments([])).toEqual([]);
  expect(splitDocuments([{ id: "e", text: "" }])).toEqual([]);
});
