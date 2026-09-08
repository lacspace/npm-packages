import { test, expect } from "vitest";
import { shouldTrack, detectDNT } from "./consent";

test("explicit consent === false always blocks", () => {
  expect(shouldTrack({ consent: false })).toBe(false);
  expect(shouldTrack({ consent: false, dnt: false })).toBe(false);
});

test("explicit consent === true allows", () => {
  expect(shouldTrack({ consent: true })).toBe(true);
});

test("Do-Not-Track blocks when respected (the default)", () => {
  expect(shouldTrack({ consent: true, dnt: true })).toBe(false);
});

test("Do-Not-Track is ignored when respectDNT is false", () => {
  expect(shouldTrack({ consent: true, dnt: true, respectDNT: false })).toBe(true);
});

test("unknown consent defaults to tracking (lite, no-banner posture)", () => {
  expect(shouldTrack({})).toBe(true);
  expect(shouldTrack({ defaultConsent: false })).toBe(false);
});

test("detectDNT returns undefined with no navigator signal (server)", () => {
  expect(detectDNT()).toBeUndefined();
});
