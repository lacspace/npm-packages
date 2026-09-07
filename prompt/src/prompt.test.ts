import { test, expect } from "vitest";
import {
  prompt,
  render,
  messages,
  fewShot,
  section,
  list,
  numbered,
  xml,
  json,
  codeBlock,
  join,
  isPrompt,
  type Message,
} from "./index";

/* ------------------------------------------------------------------ *
 * Typed templates + variable inference
 * ------------------------------------------------------------------ */

test("fills {{name}} placeholders", () => {
  const p = prompt("You are {{role}}. Answer: {{question}}");
  expect(p.render({ role: "a tutor", question: "What is 2+2?" })).toBe(
    "You are a tutor. Answer: What is 2+2?",
  );
});

test("missing variable throws a clear error", () => {
  const p = prompt("Hello {{name}}");
  expect(() => p.render({} as never)).toThrow(/Missing variable "name"/);
});

test("inline default {{key:-fallback}} is used when absent or nullish", () => {
  const p = prompt("Tone: {{tone:-neutral}}.");
  expect(p.render()).toBe("Tone: neutral.");
  expect(p.render({ tone: "playful" })).toBe("Tone: playful.");
  expect(p.render({ tone: null })).toBe("Tone: neutral.");
});

test("present-but-null variable renders as empty (no throw) without default", () => {
  const p = prompt("[{{x}}]");
  expect(p.render({ x: null })).toBe("[]");
  expect(p.render({ x: undefined })).toBe("[]");
});

test("no-arg render is allowed when there are no required vars", () => {
  const p = prompt("static text {{a:-1}}");
  expect(p.render()).toBe("static text 1");
});

/* ------------------------------------------------------------------ *
 * Control blocks
 * ------------------------------------------------------------------ */

test("{{#if}} includes body only when truthy", () => {
  const p = prompt("Hi{{#if premium}} (premium){{/if}}!");
  expect(p.render({ premium: true })).toBe("Hi (premium)!");
  expect(p.render({ premium: false })).toBe("Hi!");
  expect(p.render({ premium: [] })).toBe("Hi!"); // empty array is falsy
  expect(p.render({ premium: 0 })).toBe("Hi!");
});

test("{{#unless}} is the inverse of if", () => {
  const p = prompt("{{#unless done}}pending{{/unless}}");
  expect(p.render({ done: false })).toBe("pending");
  expect(p.render({ done: true })).toBe("");
});

test("{{#each}} iterates with {{.}}, {{this}}, {{@index}} and object props", () => {
  const p = prompt("{{#each items}}- {{.}}\n{{/each}}");
  expect(p.render({ items: ["a", "b"] })).toBe("- a\n- b\n");

  const rows = prompt("{{#each users}}{{@index}}:{{name}} {{/each}}");
  expect(rows.render({ users: [{ name: "Ada" }, { name: "Lin" }] })).toBe(
    "0:Ada 1:Lin ",
  );
});

test("nested control blocks parse and render correctly", () => {
  const p = prompt("{{#each xs}}{{#if .}}[{{.}}]{{/if}}{{/each}}");
  expect(p.render({ xs: [1, 0, 2] })).toBe("[1][2]");
});

test("unclosed block throws at render time", () => {
  expect(() => prompt("{{#if a}}oops").render({ a: 1 })).toThrow(/Unclosed/);
});

/* ------------------------------------------------------------------ *
 * Escaping
 * ------------------------------------------------------------------ */

test("escaped \\{{literal}} is emitted verbatim, not substituted", () => {
  const p = prompt("Use \\{{name}} as a placeholder for {{name}}.");
  expect(p.render({ name: "Ada" })).toBe(
    "Use {{name}} as a placeholder for Ada.",
  );
});

/* ------------------------------------------------------------------ *
 * render() convenience + composition
 * ------------------------------------------------------------------ */

test("render() convenience renders a dynamic template string", () => {
  expect(render("{{a}}+{{b}}", { a: 1, b: 2 })).toBe("1+2");
});

test("a Prompt composes when passed as a variable value", () => {
  const inner = prompt("core rules");
  const outer = prompt("System:\n{{body}}");
  expect(outer.render({ body: inner })).toBe("System:\ncore rules");
});

test("object/array values are JSON-stringified", () => {
  expect(prompt("{{x}}").render({ x: { a: 1 } })).toBe('{"a":1}');
});

/* ------------------------------------------------------------------ *
 * Message builder
 * ------------------------------------------------------------------ */

test("messages() preserves order and roles, accepts Prompts", () => {
  const built = messages()
    .system("be terse")
    .user(prompt("hi {{who}}").render({ who: "there" }))
    .assistant("ok")
    .push("tool", "result")
    .build();
  expect(built).toEqual<Message[]>([
    { role: "system", content: "be terse" },
    { role: "user", content: "hi there" },
    { role: "assistant", content: "ok" },
    { role: "tool", content: "result" },
  ]);
});

test("messages().add() splices in pre-built messages (e.g. few-shot)", () => {
  const shots = fewShot([{ input: "hi", output: "bonjour" }]);
  const built = messages().system("translate").add(...shots).user("bye").build();
  expect(built.map((m) => m.role)).toEqual([
    "system",
    "user",
    "assistant",
    "user",
  ]);
});

/* ------------------------------------------------------------------ *
 * Few-shot
 * ------------------------------------------------------------------ */

test("fewShot() alternates user/assistant messages", () => {
  const out = fewShot([
    { input: "hi", output: "bonjour" },
    { input: "bye", output: "au revoir" },
  ]);
  expect(out).toEqual<Message[]>([
    { role: "user", content: "hi" },
    { role: "assistant", content: "bonjour" },
    { role: "user", content: "bye" },
    { role: "assistant", content: "au revoir" },
  ]);
});

test("fewShot() text mode renders a labelled block", () => {
  const text = fewShot(
    [
      { input: "hi", output: "bonjour" },
      { input: "bye", output: "au revoir" },
    ],
    { format: "text" },
  );
  expect(text).toBe("Input: hi\nOutput: bonjour\n\nInput: bye\nOutput: au revoir");
});

/* ------------------------------------------------------------------ *
 * Formatting helpers
 * ------------------------------------------------------------------ */

test("formatting helpers produce expected fragments", () => {
  expect(section("Context", "body")).toBe("## Context\n\nbody");
  expect(list(["a", "b"])).toBe("- a\n- b");
  expect(numbered(["a", "b"])).toBe("1. a\n2. b");
  expect(xml("doc", "text")).toBe("<doc>\ntext\n</doc>");
  expect(json({ a: 1 })).toBe('{\n  "a": 1\n}');
  expect(codeBlock("ts", "const x = 1")).toBe("```ts\nconst x = 1\n```");
});

test("join() composes fragments and drops empties", () => {
  expect(join("A", "", "B", null, prompt("C"))).toBe("A\n\nB\n\nC");
});

test("isPrompt() distinguishes Prompts from strings", () => {
  expect(isPrompt(prompt("x"))).toBe(true);
  expect(isPrompt("x")).toBe(false);
});

/* ------------------------------------------------------------------ *
 * Type-level sanity (compile-time)
 * ------------------------------------------------------------------ */

// Compile-time only — checked by `tsc`, never executed at runtime.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function __typeLevelChecks(): void {
  const p = prompt("Hi {{name}}");
  // @ts-expect-error — 'name' is required
  p.render({});
  // @ts-expect-error — 'nope' is not a variable of this template
  p.render({ name: "x", nope: 1 });
  // valid call — no error
  p.render({ name: "x" });
}

test("type-level: a valid render call works at runtime", () => {
  const p = prompt("Hi {{name}}");
  expect(p.render({ name: "x" })).toBe("Hi x");
  void __typeLevelChecks; // reference so it is not tree-shaken/unused
});
