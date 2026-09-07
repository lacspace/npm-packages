import { test, expect } from "vitest";
import { escapeLlmsText, llmsTxt } from "./index";

test("escapeLlmsText escapes the link characters", () => {
  expect(escapeLlmsText("Guide [v2] (beta)")).toBe("Guide \\[v2\\] \\(beta\\)");
  expect(escapeLlmsText("plain text")).toBe("plain text");
  expect(escapeLlmsText("back\\slash")).toBe("back\\\\slash");
});

test("llmsTxt does NOT escape by default (output byte-for-byte unchanged)", () => {
  const out = llmsTxt({
    title: "T",
    sections: [{ title: "S", links: [{ title: "A [x]", url: "https://x.com/a", notes: "(n)" }] }],
  });
  expect(out).toContain("- [A [x]](https://x.com/a): (n)");
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
