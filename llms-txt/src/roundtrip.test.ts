import { test, expect } from "vitest";
import { llmsTxt, parseLlmsTxt, escapeLlmsText, unescapeLlmsText, type LlmsDoc } from "./index";

/** Compare only the document's own fields, ignoring key order. */
const norm = (d: Partial<LlmsDoc>) =>
  JSON.stringify({ title: d.title, summary: d.summary, details: d.details, sections: d.sections, optional: d.optional });

const roundTrips = (doc: LlmsDoc) => expect(norm(parseLlmsTxt(llmsTxt(doc)))).toBe(norm(doc));
const linkLine = (txt: string) => txt.split("\n").find((l) => l.startsWith("- "));

// The headline bug: escaping was opt-in, so the DEFAULT output was invalid
// Markdown for an ordinary title, and parseLlmsTxt() read `- [Guide [v2]](/g)`
// as NO LINK AT ALL. The page silently vanished from the file an LLM reads.
test("a title containing brackets survives the round trip", () => {
  const doc: LlmsDoc = { title: "T", sections: [{ title: "S", links: [{ title: "Guide [v2]", url: "https://a.com/g" }] }] };
  expect(linkLine(llmsTxt(doc))).toBe("- [Guide \\[v2\\]](https://a.com/g)");
  const links = parseLlmsTxt(llmsTxt(doc)).sections[0]!.links;
  expect(links).toHaveLength(1); // used to be 0 — the link was dropped entirely
  expect(links[0]!.title).toBe("Guide [v2]");
  roundTrips(doc);
});

test("a title with no Markdown characters is byte-for-byte unchanged", () => {
  // Escaping only touches \ [ ] ( ), so turning it on by default must not alter
  // ordinary output — that is what makes the new default safe.
  expect(linkLine(llmsTxt({ title: "T", sections: [{ title: "S", links: [{ title: "Getting Started", url: "https://a.com/s" }] }] })))
    .toBe("- [Getting Started](https://a.com/s)");
});

test("escape:false still gives the old unescaped output", () => {
  const doc: LlmsDoc = { title: "T", sections: [{ title: "S", links: [{ title: "Guide [v2]", url: "https://a.com/g" }] }] };
  expect(linkLine(llmsTxt(doc, { escape: false }))).toBe("- [Guide [v2]](https://a.com/g)");
});

test("parens, backslashes and bracketed notes all round-trip", () => {
  roundTrips({ title: "T", sections: [{ title: "S", links: [{ title: "A (beta)", url: "https://a.com/a" }] }] });
  roundTrips({ title: "T", sections: [{ title: "S", links: [{ title: "a\\b", url: "https://a.com/a" }] }] });
  roundTrips({ title: "T", sections: [{ title: "S", links: [{ title: "A", url: "https://a.com/a", notes: "see [docs]" }] }] });
});

// `> ${summary}` quoted only the first line; the rest left the blockquote and
// came back as `details`, so a two-line summary silently became two fields.
test("a multi-line summary stays one summary", () => {
  const doc: LlmsDoc = { title: "T", summary: "Line one.\nLine two.", sections: [] };
  const txt = llmsTxt(doc);
  expect(txt).toContain("> Line one.\n> Line two.");
  const back = parseLlmsTxt(txt);
  expect(back.summary).toBe("Line one.\nLine two.");
  expect(back.details).toBeUndefined();
  roundTrips(doc);
});

test("a single-line summary and a details block are untouched", () => {
  roundTrips({ title: "T", summary: "One line.", sections: [] });
  roundTrips({ title: "T", details: "Some prose here.", sections: [] });
});

test("the optional block round-trips, escaping included", () => {
  roundTrips({
    title: "T",
    sections: [{ title: "S", links: [{ title: "A", url: "https://a.com/a" }] }],
    optional: [{ title: "Old [v1]", url: "https://a.com/o" }],
  });
});

test("an empty section round-trips as an empty section", () => {
  roundTrips({ title: "T", sections: [{ title: "Empty", links: [] }] });
});

test("unescapeLlmsText is the exact inverse of escapeLlmsText", () => {
  for (const s of ["plain", "a [b] c", "x (y)", "back\\slash", "[](){}\\", "]]] ((("]) {
    expect(unescapeLlmsText(escapeLlmsText(s)), s).toBe(s);
  }
});

test("a hand-written unescaped file still parses (older files keep working)", () => {
  const legacy = "# T\n\n## S\n\n- [Plain Title](https://a.com/p): a note\n";
  const doc = parseLlmsTxt(legacy);
  expect(doc.sections[0]!.links[0]).toEqual({ title: "Plain Title", url: "https://a.com/p", notes: "a note" });
});
