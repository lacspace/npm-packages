import { test, expect } from "vitest";
import { parseRobots, isAllowed } from "./index";

// Google's robots.txt path-matching table, verbatim. These passed before and are
// kept as guards so the group-selection fix below cannot disturb them.
test("path matching follows Google's spec table for /fish", () => {
  const r = parseRobots("User-agent: *\nDisallow: /fish\n");
  for (const p of ["/fish", "/fish.html", "/fish/salmon.html", "/fishheads", "/fishheads/yummy.html", "/fish.php?id=anything"])
    expect(isAllowed(p, r), p).toBe(false);
  for (const p of ["/Fish.asp", "/catfish", "/?id=fish", "/desert/fish"])
    expect(isAllowed(p, r), p).toBe(true);
});

test("a trailing slash restricts the rule to the directory", () => {
  const r = parseRobots("User-agent: *\nDisallow: /fish/\n");
  for (const p of ["/fish/", "/fish/?id=anything", "/fish/salmon.htm"]) expect(isAllowed(p, r), p).toBe(false);
  for (const p of ["/fish", "/fish.html", "/Fish/Salmon.asp"]) expect(isAllowed(p, r), p).toBe(true);
});

test("$ anchors the pattern to the end of the path", () => {
  const r = parseRobots("User-agent: *\nDisallow: /*.php$\n");
  for (const p of ["/filename.php", "/folder/filename.php"]) expect(isAllowed(p, r), p).toBe(false);
  for (const p of ["/filename.php?parameters", "/filename.php5"]) expect(isAllowed(p, r), p).toBe(true);
});

test("longest match wins and a tie favours Allow", () => {
  expect(isAllowed("/page", parseRobots("User-agent: *\nAllow: /p\nDisallow: /\n"))).toBe(true);
  expect(isAllowed("/folder/page", parseRobots("User-agent: *\nAllow: /folder\nDisallow: /folder\n"))).toBe(true);
  expect(isAllowed("/anything", parseRobots("User-agent: *\nDisallow:\n"))).toBe(true);
});

// RFC 9309 2.2.1 — the two group-selection rules that were both wrong.
// Each one made isAllowed() answer a question about a real site incorrectly.
test("the MOST specific user-agent group wins, not the first one listed", () => {
  // Googlebot-News has its own group and must not inherit Googlebot's rules
  // just because Googlebot is listed above it.
  const txt = "User-agent: Googlebot\nDisallow: /private\n\nUser-agent: Googlebot-News\nDisallow: /nothing-here\n";
  const r = parseRobots(txt);
  expect(isAllowed("/private", r, "Googlebot-News")).toBe(true);
  expect(isAllowed("/private", r, "Googlebot")).toBe(false);

  // Same file with the groups swapped must give the same answers — if the
  // result depends on declaration order, specificity is not being honoured.
  const swapped = parseRobots("User-agent: Googlebot-News\nDisallow: /nothing-here\n\nUser-agent: Googlebot\nDisallow: /private\n");
  expect(isAllowed("/private", swapped, "Googlebot-News")).toBe(true);
  expect(isAllowed("/private", swapped, "Googlebot")).toBe(false);
});

test("a specific group beats a wildcard group regardless of order", () => {
  const r = parseRobots("User-agent: *\nDisallow: /\n\nUser-agent: Googlebot\nAllow: /\nDisallow:\n");
  expect(isAllowed("/anything", r, "Googlebot")).toBe(true);
  expect(isAllowed("/anything", r, "SomeOtherBot")).toBe(false);
});

test("records sharing a user-agent are merged, not just the first one", () => {
  const r = parseRobots("User-agent: *\nDisallow: /a\n\nUser-agent: *\nDisallow: /b\n");
  expect(isAllowed("/a", r)).toBe(false);
  expect(isAllowed("/b", r)).toBe(false); // the second * group used to be dropped
  expect(isAllowed("/c", r)).toBe(true);
});

test("merging applies to specific agents too, and Allow still wins ties across records", () => {
  const r = parseRobots("User-agent: Bingbot\nDisallow: /x\n\nUser-agent: Bingbot\nAllow: /x\n");
  expect(isAllowed("/x", r, "Bingbot")).toBe(true); // equal length -> Allow
  expect(isAllowed("/x", r, "Googlebot")).toBe(true); // no group matches at all
});

test("an unknown agent with no wildcard group may crawl everything", () => {
  const r = parseRobots("User-agent: Googlebot\nDisallow: /\n");
  expect(isAllowed("/anything", r, "RandomBot")).toBe(true);
  expect(isAllowed("/anything", r, "Googlebot")).toBe(false);
});
