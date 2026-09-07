import { test, expect } from "vitest";
import { escapeXml, cdata, rfc822Date, rfc3339Date, rss } from "./index";

test("escapeXml escapes the five XML special characters", () => {
  expect(escapeXml(`a & b < c > d " e ' f`)).toBe(
    "a &amp; b &lt; c &gt; d &quot; e &apos; f",
  );
});

test("escapeXml strips illegal control characters", () => {
  expect(escapeXml("a\x00b\x08c\x1Fd")).toBe("abcd");
});

test("escapeXml matches the escaping the generators use", () => {
  const out = rss({ title: "A & B", link: "https://x.com" }, []);
  expect(out).toContain(`<title>${escapeXml("A & B")}</title>`);
});

test("cdata wraps content in a CDATA section", () => {
  expect(cdata("<p>hi</p>")).toBe("<![CDATA[<p>hi</p>]]>");
});

test("cdata safely splits a literal ]]> sequence", () => {
  const wrapped = cdata("evil ]]> break");
  expect(wrapped).toBe("<![CDATA[evil ]]]]><![CDATA[> break]]>");
  expect(wrapped.includes("]]]]><![CDATA[>")).toBe(true);
});

test("rfc822Date formats a Date as an RFC-822 string", () => {
  expect(rfc822Date(new Date("2026-01-01T00:00:00Z"))).toBe("Thu, 01 Jan 2026 00:00:00 GMT");
});

test("rfc822Date accepts ISO strings and epoch-ms numbers", () => {
  expect(rfc822Date("2026-01-01T00:00:00Z")).toBe("Thu, 01 Jan 2026 00:00:00 GMT");
  expect(rfc822Date(Date.UTC(2026, 0, 1))).toBe("Thu, 01 Jan 2026 00:00:00 GMT");
});

test("rfc3339Date formats a date as RFC-3339 / ISO-8601", () => {
  expect(rfc3339Date("2026-01-01T00:00:00Z")).toBe("2026-01-01T00:00:00.000Z");
  expect(rfc3339Date(new Date(0))).toBe("1970-01-01T00:00:00.000Z");
});

test("date helpers throw RangeError on unparseable input", () => {
  expect(() => rfc822Date("not-a-date")).toThrow(RangeError);
  expect(() => rfc3339Date("nope")).toThrow(RangeError);
});
