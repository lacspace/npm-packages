import { test, expect } from "vitest";
import { parseUtm } from "./utm";

test("parses the standard utm_* params into a campaign", () => {
  const c = parseUtm("https://x.com/p?utm_source=google&utm_medium=cpc&utm_campaign=launch");
  expect(c).toEqual({ source: "google", medium: "cpc", name: "launch" });
});

test("returns undefined when there are no utm params", () => {
  expect(parseUtm("https://x.com/p?ref=home")).toBeUndefined();
  expect(parseUtm("https://x.com/p")).toBeUndefined();
  expect(parseUtm("")).toBeUndefined();
});

test("accepts a bare query string and decodes values", () => {
  const c = parseUtm("utm_source=news%20letter&utm_term=black+friday");
  expect(c).toEqual({ source: "news letter", term: "black friday" });
});

test("keeps non-standard utm_* params without the prefix", () => {
  const c = parseUtm("?utm_source=fb&utm_id=123&utm_ad=hero");
  expect(c).toEqual({ source: "fb", id: "123", ad: "hero" });
});

test("ignores the hash fragment", () => {
  const c = parseUtm("https://x.com/p?utm_source=fb#utm_medium=nope");
  expect(c).toEqual({ source: "fb" });
});
