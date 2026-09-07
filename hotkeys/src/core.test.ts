import { test, expect } from "vitest";
import {
  parseHotkey,
  parseSequence,
  matchHotkey,
  matchesHotkey,
  matchesParsed,
  createSequenceMatcher,
  scopesActive,
  shouldIgnore,
  formatHotkey,
  resolvePlatform,
  isModifierKey,
  isMac,
  type KeyEventLike,
} from "./core";

/* -------------------------------------------------------------------------- */
/* parseHotkey + normalization                                                */
/* -------------------------------------------------------------------------- */

test("parseHotkey parses a mod combo", () => {
  expect(parseHotkey("mod+k")).toEqual({
    key: "k",
    mod: true,
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
  });
});

test("parseHotkey parses cmd+shift+p (cmd → meta)", () => {
  expect(parseHotkey("cmd+shift+p")).toEqual({
    key: "p",
    mod: false,
    ctrl: false,
    alt: false,
    shift: true,
    meta: true,
  });
});

test("parseHotkey parses ctrl+alt+del with aliases", () => {
  expect(parseHotkey("ctrl+alt+del")).toEqual({
    key: "delete",
    mod: false,
    ctrl: true,
    alt: true,
    shift: false,
    meta: false,
  });
});

test("parseHotkey normalizes key aliases (esc, space, arrows)", () => {
  expect(parseHotkey("esc").key).toBe("escape");
  expect(parseHotkey("space").key).toBe(" ");
  expect(parseHotkey("up").key).toBe("arrowup");
  expect(parseHotkey("shift+right").key).toBe("arrowright");
});

test("parseHotkey lowercases single letters and is case-insensitive on modifiers", () => {
  expect(parseHotkey("MOD+SHIFT+K")).toEqual(parseHotkey("mod+shift+k"));
  expect(parseHotkey("Ctrl+A").key).toBe("a");
});

test("parseHotkey treats option/opt/command/win/super synonyms", () => {
  expect(parseHotkey("option+a").alt).toBe(true);
  expect(parseHotkey("opt+a").alt).toBe(true);
  expect(parseHotkey("command+a").meta).toBe(true);
  expect(parseHotkey("win+a").meta).toBe(true);
  expect(parseHotkey("super+a").meta).toBe(true);
});

/* -------------------------------------------------------------------------- */
/* resolvePlatform + mod resolution                                           */
/* -------------------------------------------------------------------------- */

test("resolvePlatform honours an explicit platform and auto-detects otherwise", () => {
  expect(resolvePlatform("mac")).toBe("mac");
  expect(resolvePlatform("other")).toBe("other");
  // With no explicit platform it follows isMac() (host-dependent, but consistent).
  expect(resolvePlatform()).toBe(isMac() ? "mac" : "other");
});

test("mod resolves to metaKey on mac and ctrlKey elsewhere", () => {
  const metaEvent: KeyEventLike = { key: "k", metaKey: true };
  const ctrlEvent: KeyEventLike = { key: "k", ctrlKey: true };

  expect(matchHotkey("mod+k", metaEvent, { platform: "mac" })).toBe(true);
  expect(matchHotkey("mod+k", ctrlEvent, { platform: "mac" })).toBe(false);

  expect(matchHotkey("mod+k", ctrlEvent, { platform: "other" })).toBe(true);
  expect(matchHotkey("mod+k", metaEvent, { platform: "other" })).toBe(false);
});

/* -------------------------------------------------------------------------- */
/* matchHotkey — match + non-match against synthetic events                   */
/* -------------------------------------------------------------------------- */

test("matchHotkey matches a plain combo", () => {
  expect(matchHotkey("shift+a", { key: "A", shiftKey: true }, { platform: "other" })).toBe(true);
});

test("matchHotkey requires modifiers to match exactly (ctrl+k not fired by ctrl+shift+k)", () => {
  const evt: KeyEventLike = { key: "k", ctrlKey: true, shiftKey: true };
  expect(matchHotkey("ctrl+k", evt, { platform: "other" })).toBe(false);
  expect(matchHotkey("ctrl+shift+k", evt, { platform: "other" })).toBe(true);
});

test("matchHotkey non-match on wrong key and treats missing modifier flags as false", () => {
  expect(matchHotkey("mod+k", { key: "j", ctrlKey: true }, { platform: "other" })).toBe(false);
  // altKey omitted → treated as false, so "alt+k" must not match.
  expect(matchHotkey("alt+k", { key: "k" }, { platform: "other" })).toBe(false);
  expect(matchHotkey("k", { key: "k" }, { platform: "other" })).toBe(true);
});

test("matchHotkey accepts a pre-parsed combo", () => {
  const parsed = parseHotkey("mod+enter");
  expect(matchHotkey(parsed, { key: "Enter", metaKey: true }, { platform: "mac" })).toBe(true);
});

test("matchesParsed coerces truthy/falsy modifier fields", () => {
  const parsed = parseHotkey("ctrl+k");
  expect(matchesParsed({ key: "k", ctrlKey: true }, parsed, false)).toBe(true);
  expect(matchesParsed({ key: "k", ctrlKey: false }, parsed, false)).toBe(false);
});

/* -------------------------------------------------------------------------- */
/* parseSequence + sequence matcher (injectable clock)                        */
/* -------------------------------------------------------------------------- */

test("parseSequence splits on 'then' and whitespace", () => {
  expect(parseSequence("g then d").map((s) => s.key)).toEqual(["g", "d"]);
  expect(parseSequence("g d").map((s) => s.key)).toEqual(["g", "d"]);
  expect(parseSequence("mod+k").length).toBe(1);
});

test("sequence matcher completes only when steps arrive in-time and in order", () => {
  const m = createSequenceMatcher("g then d", { platform: "other", timeout: 1000 });
  expect(m.handle({ key: "g" }, 0)).toBe(false);
  expect(m.handle({ key: "d" }, 500)).toBe(true); // within 1000ms window
});

test("sequence matcher resets when the window elapses (timeout)", () => {
  const m = createSequenceMatcher("g then d", { platform: "other", timeout: 1000 });
  expect(m.handle({ key: "g" }, 0)).toBe(false);
  // 2000ms later → step timed out; "d" alone does not complete.
  expect(m.handle({ key: "d" }, 2000)).toBe(false);
  // But pressing g then d again in-time works.
  expect(m.handle({ key: "g" }, 2000)).toBe(false);
  expect(m.handle({ key: "d" }, 2200)).toBe(true);
});

test("sequence matcher restarts when the first step is re-pressed", () => {
  const m = createSequenceMatcher("g then d", { platform: "other" });
  expect(m.handle({ key: "g" }, 0)).toBe(false);
  expect(m.handle({ key: "g" }, 100)).toBe(false); // restart, still at index 1
  expect(m.handle({ key: "d" }, 200)).toBe(true);
});

test("sequence matcher ignores lone modifier presses", () => {
  const m = createSequenceMatcher("g then d", { platform: "other" });
  expect(m.handle({ key: "g" }, 0)).toBe(false);
  expect(m.handle({ key: "Shift", shiftKey: true }, 100)).toBe(false); // no effect
  expect(m.handle({ key: "d" }, 200)).toBe(true);
});

test("sequence matcher reset() returns progress to the start", () => {
  const m = createSequenceMatcher("g then d", { platform: "other" });
  expect(m.handle({ key: "g" }, 0)).toBe(false);
  m.reset();
  expect(m.handle({ key: "d" }, 100)).toBe(false); // d is not the first step
});

test("isModifierKey flags modifier keys only", () => {
  expect(isModifierKey("Shift")).toBe(true);
  expect(isModifierKey("Meta")).toBe(true);
  expect(isModifierKey("a")).toBe(false);
});

/* -------------------------------------------------------------------------- */
/* scopesActive — pure scope gating                                           */
/* -------------------------------------------------------------------------- */

test("scopesActive: unscoped hotkeys always fire", () => {
  expect(scopesActive(undefined, ["editor"])).toBe(true);
  expect(scopesActive(null, [])).toBe(true);
  expect(scopesActive([], ["editor"])).toBe(true);
});

test("scopesActive: fires only when a required scope is active (any-of)", () => {
  expect(scopesActive("editor", ["editor"])).toBe(true);
  expect(scopesActive("editor", ["global"])).toBe(false);
  expect(scopesActive(["a", "b"], ["b"])).toBe(true);
  expect(scopesActive(["a", "b"], ["c"])).toBe(false);
});

test("scopesActive accepts a Set of active scopes", () => {
  expect(scopesActive("editor", new Set(["editor", "global"]))).toBe(true);
  expect(scopesActive("editor", new Set(["global"]))).toBe(false);
});

/* -------------------------------------------------------------------------- */
/* shouldIgnore — input vs non-input                                          */
/* -------------------------------------------------------------------------- */

test("shouldIgnore skips form fields but not other elements", () => {
  expect(shouldIgnore({ tagName: "INPUT" })).toBe(true);
  expect(shouldIgnore({ tagName: "textarea" })).toBe(true); // any casing
  expect(shouldIgnore({ tagName: "SELECT" })).toBe(true);
  expect(shouldIgnore({ tagName: "DIV" })).toBe(false);
  expect(shouldIgnore({ tagName: "BUTTON" })).toBe(false);
  expect(shouldIgnore(null)).toBe(false);
});

test("shouldIgnore skips contentEditable and editable roles", () => {
  expect(shouldIgnore({ tagName: "DIV", isContentEditable: true })).toBe(true);
  expect(shouldIgnore({ tagName: "DIV", role: "textbox" })).toBe(true);
  expect(shouldIgnore({ tagName: "DIV", role: "button" })).toBe(false);
});

test("shouldIgnore honours enableOnFormTags and custom tag/role config", () => {
  expect(shouldIgnore({ tagName: "INPUT" }, { enableOnFormTags: true })).toBe(false);
  expect(shouldIgnore({ tagName: "DIV", isContentEditable: true }, { ignoreContentEditable: false })).toBe(false);
  expect(shouldIgnore({ tagName: "MY-EDITOR" }, { ignoreTags: ["my-editor"] })).toBe(true);
  expect(shouldIgnore({ tagName: "INPUT" }, { ignoreTags: ["textarea"] })).toBe(false);
});

/* -------------------------------------------------------------------------- */
/* formatHotkey — mac vs non-mac                                              */
/* -------------------------------------------------------------------------- */

test("formatHotkey renders mac glyphs vs non-mac words", () => {
  expect(formatHotkey("mod+shift+k", { platform: "mac" })).toBe("⌘⇧K");
  expect(formatHotkey("mod+shift+k", { platform: "other" })).toBe("Ctrl+Shift+K");
});

test("formatHotkey supports the legacy { mac } boolean and special keys", () => {
  expect(formatHotkey("mod+enter", { mac: true })).toBe("⌘↵");
  expect(formatHotkey("mod+enter", { mac: false })).toBe("Ctrl+Enter");
  expect(formatHotkey("ctrl+space", { platform: "other" })).toBe("Ctrl+Space");
  expect(formatHotkey("shift+escape", { platform: "mac" })).toBe("⇧Esc");
});

test("formatHotkey: platform option wins over the mac boolean", () => {
  expect(formatHotkey("mod+k", { mac: true, platform: "other" })).toBe("Ctrl+K");
});

test("formatHotkey auto-detects to match the resolved platform", () => {
  const expected = isMac() ? "⌘K" : "Ctrl+K";
  expect(formatHotkey("mod+k")).toBe(expected);
  expect(formatHotkey("mod+k")).toBe(formatHotkey("mod+k", { platform: resolvePlatform() }));
});

/* -------------------------------------------------------------------------- */
/* matchesHotkey (legacy signature, auto-detect)                              */
/* -------------------------------------------------------------------------- */

test("matchesHotkey works with the legacy (event, combo) signature", () => {
  // mod resolves via isMac(): meta on mac, ctrl elsewhere — assert both against it.
  const ctrlEvt = { key: "k", ctrlKey: true } as unknown as KeyboardEvent;
  const metaEvt = { key: "k", metaKey: true } as unknown as KeyboardEvent;
  expect(matchesHotkey(ctrlEvt, "mod+k")).toBe(!isMac());
  expect(matchesHotkey(metaEvt, "mod+k")).toBe(isMac());
});
