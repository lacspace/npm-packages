import { test, expect } from "vitest";
import { markdownToHtml } from "./index";

test("GFM tables render with alignment", () => {
  const html = markdownToHtml(["| A | B |", "| :- | -: |", "| 1 | 2 |"].join("\n"));
  expect(html).toContain("<table>");
  expect(html).toContain('<th style="text-align:left">A</th>');
  expect(html).toContain('<th style="text-align:right">B</th>');
  expect(html).toContain('<td style="text-align:right">2</td>');
});

test("strikethrough renders <del>", () => {
  expect(markdownToHtml("~~gone~~")).toContain("<del>gone</del>");
});

test("task list items render disabled checkboxes", () => {
  const html = markdownToHtml(["- [ ] todo", "- [x] done"].join("\n"));
  expect(html).toContain('<input type="checkbox" disabled /> todo');
  expect(html).toContain('<input type="checkbox" disabled checked /> done');
});

test("angle-bracket autolinks always work", () => {
  expect(markdownToHtml("<https://lacspace.com>")).toContain('<a href="https://lacspace.com">https://lacspace.com</a>');
});

test("bare URL autolinking is off by default, on via option", () => {
  const off = markdownToHtml("visit https://lacspace.com now");
  expect(off).not.toContain("<a href");
  const on = markdownToHtml("visit https://lacspace.com now", { autolinkBareUrls: true });
  expect(on).toContain('<a href="https://lacspace.com">https://lacspace.com</a>');
});

test("bare autolink keeps trailing punctuation outside the link and www. gets a scheme", () => {
  const out = markdownToHtml("see https://x.com/a, and www.y.com.", { autolinkBareUrls: true });
  expect(out).toContain('<a href="https://x.com/a">https://x.com/a</a>,');
  expect(out).toContain('<a href="http://www.y.com">www.y.com</a>.');
});

test("bare autolink does not double-wrap an existing markdown link", () => {
  const out = markdownToHtml("[site](https://lacspace.com)", { autolinkBareUrls: true });
  expect(out).toBe('<p><a href="https://lacspace.com">site</a></p>');
});
