import { test, expect } from "vitest";
import { preheader, render, heading } from "./index";

test("preheader produces hidden preview markup with the text", () => {
  const html = preheader("Your code is inside");
  expect(html).toContain("display:none");
  expect(html).toContain("Your code is inside");
});

test("preheader escapes untrusted text", () => {
  expect(preheader("<x>")).toContain("&lt;x&gt;");
  expect(preheader("<x>")).not.toContain("<x>");
});

test("preheader block composes into render()", () => {
  const html = render({ title: "T" }, [preheader("Preview line"), heading("Body")]);
  expect(html).toContain("Preview line");
  expect(html).toContain("Body");
});
