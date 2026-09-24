import { test, expect } from "vitest";
import { escapeLlmsText, llmsTxt } from "./index";

test("escapeLlmsText escapes the link characters", () => {
  expect(escapeLlmsText("Guide [v2] (beta)")).toBe("Guide \\[v2\\] \\(beta\\)");
  expect(escapeLlmsText("plain text")).toBe("plain text");
  expect(escapeLlmsText("back\\slash")).toBe("back\\\\slash");
});

// This test used to assert the opposite — that llmsTxt did NOT escape by
// default — to guarantee the output of existing callers was unchanged when the
// escape option was introduced. That guarantee turned out to protect a bug: the
// unescaped default emitted `- [A [x]](...)`, which is not a parseable Markdown
// link, and parseLlmsTxt() read it as NO LINK, dropping the page from the file.
// Escaping only touches \ [ ] ( ), so the compatibility goal still holds for
// every title that does not contain them — see the next test.
test("llmsTxt escapes link text by default", () => {
  const out = llmsTxt({
    title: "T",
    sections: [{ title: "S", links: [{ title: "A [x]", url: "https://x.com/a", notes: "(n)" }] }],
  });
  expect(out).toContain("- [A \\[x\\]](https://x.com/a): \\(n\\)");
});

test("escape:false restores the old unescaped output", () => {
  const out = llmsTxt(
    { title: "T", sections: [{ title: "S", links: [{ title: "A [x]", url: "https://x.com/a", notes: "(n)" }] }] },
    { escape: false },
  );
  expect(out).toContain("- [A [x]](https://x.com/a): (n)");
});

test("a title with no Markdown characters is unchanged by the new default", () => {
  const out = llmsTxt({ title: "T", sections: [{ title: "S", links: [{ title: "Getting Started", url: "https://x.com/s", notes: "a note" }] }] });
  expect(out).toContain("- [Getting Started](https://x.com/s): a note");
});

test("llmsTxt escapes titles and notes when escape:true", () => {
  const out = llmsTxt(
    {
      title: "T",
      sections: [{ title: "S", links: [{ title: "A [x]", url: "https://x.com/a", notes: "see (b)" }] }],
    },
    { escape: true },
  );
  expect(out).toContain("- [A \\[x\\]](https://x.com/a): see \\(b\\)");
});
