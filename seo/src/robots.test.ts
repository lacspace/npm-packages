import { test, expect } from "vitest";
import { robotsContent, robots } from "./index";

test("robotsContent renders index/follow flags and numeric limits", () => {
  const s = robotsContent({ index: false, follow: true, maxSnippet: -1, maxImagePreview: "large" });
  expect(s).toBe("noindex, follow, max-snippet:-1, max-image-preview:large");
});

test("robotsContent emits boolean-only directives and unavailable_after", () => {
  const s = robotsContent({ noarchive: true, nosnippet: true, unavailableAfter: "2027-01-01T00:00:00Z" });
  expect(s).toBe("noarchive, nosnippet, unavailable_after: 2027-01-01T00:00:00Z");
});

test("robotsContent omits unset index/follow", () => {
  expect(robotsContent({})).toBe("");
  expect(robotsContent({ maxVideoPreview: 0 })).toBe("max-video-preview:0");
});

test("robots() defaults index/follow to true and buckets limits under googleBot", () => {
  const r = robots({ maxSnippet: -1, maxImagePreview: "large", noimageindex: true });
  expect(r.index).toBe(true);
  expect(r.follow).toBe(true);
  expect(r.googleBot).toEqual({
    noimageindex: true,
    "max-snippet": -1,
    "max-image-preview": "large",
  });
});

test("robots() honours explicit false + top-level flags, no googleBot when empty", () => {
  const r = robots({ index: false, follow: false, noarchive: true });
  expect(r).toEqual({ index: false, follow: false, noarchive: true });
  expect(r.googleBot).toBeUndefined();
});
