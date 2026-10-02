import { describe, expect, it } from "vitest";
import { autoBind, catalogue, catalogueForPrompt, describe as describeApi, execute, planPrompt, validate, validatePlan } from "./index.js";
import type { Descriptor, Plan } from "./index.js";

const explainerDesc: Descriptor = {
  name: "@lacspace/explainer", version: "1.0.0", summary: "Article → explainer. More text.",
  commands: [{ name: "explain", input: { type: "object", properties: { text: { type: "string" }, lang: { enum: ["en", "ne", "auto"] }, slides: { type: "integer", minimum: 2 } }, required: ["text"] }, output: "Explainer" }],
};
const ttsDesc: Descriptor = {
  name: "@lacspace/tts", version: "1.0.0", summary: "Speech.",
  commands: [{ name: "speak", input: { type: "object", properties: { text: { type: "string" }, voice: { type: "string" } }, required: ["text"] }, output: "{ audio, segments }" }],
};
const cat = catalogue([explainerDesc, { describe: () => ttsDesc }]);

describe("catalogue", () => {
  it("merges descriptors into pkg.command ids and renders a compact prompt view", () => {
    expect(Object.keys(cat.commands)).toEqual(["explainer.explain", "tts.speak"]);
    expect(cat.packages[1]!.name).toBe("@lacspace/tts");
    const txt = catalogueForPrompt(cat);
    expect(txt).toContain("## explainer — Article → explainer");
    expect(txt).toContain("- explainer.explain(text*:string, lang(en|ne|auto), slides:integer) → Explainer");
    expect(catalogueForPrompt(cat, { packages: ["tts"] })).not.toContain("explainer.explain");
    expect(catalogueForPrompt(cat, { maxChars: 40 }).length).toBe(40);
  });
});

describe("validate + validatePlan", () => {
  it("checks types, enums, required, ranges", () => {
    expect(validate({ text: "x", lang: "fr", slides: 1 }, explainerDesc.commands[0]!.input)).toEqual([
      { path: "$.lang", message: 'must be one of "en", "ne", "auto"' },
      { path: "$.slides", message: "must be ≥ 2" },
    ]);
    expect(validate({ slides: 2.5 }, explainerDesc.commands[0]!.input).map((e) => e.path)).toEqual(["$.text", "$.slides"]);
  });
  it("rejects unknown commands, missing inputs, bad refs and duplicate ids; accepts refs as typed-at-runtime", () => {
    const bad: Plan = { steps: [
      { id: "a", command: "explainer.explain", input: { lang: "ne" } },
      { id: "a", command: "nope.cmd" },
      { id: "b", command: "tts.speak", input: { text: "$steps.c.output.x" } },
    ] };
    const errs = validatePlan(bad, cat);
    expect(errs).toEqual([
      { step: "a", message: "input.text: required" },
      { step: "a", message: "duplicate step id" },
      { step: "a", message: 'unknown command "nope.cmd"' },
      { step: "b", message: 'ref to "c" which is not an earlier step' },
    ]);
    const good: Plan = { steps: [
      { id: "ex", command: "explainer.explain", input: { text: "hello", lang: "auto" } },
      { id: "v", command: "tts.speak", input: { text: "$steps.ex.output.script.scenes.0.voiceover" } },
    ] };
    expect(validatePlan(good, cat)).toEqual([]);
    expect(validatePlan({ steps: [] }, cat)[0]!.message).toMatch(/non-empty/);
  });
});

describe("execute", () => {
  const plan: Plan = { steps: [
    { id: "ex", command: "explainer.explain", input: { text: "hello", lang: "auto" } },
    { id: "v1", command: "tts.speak", input: { text: "$steps.ex.output.lines.0" }, parallel: "voices" },
    { id: "v2", command: "tts.speak", input: { text: "$steps.ex.output.lines.1" }, parallel: "voices" },
    { id: "skip", command: "tts.speak", input: { text: "x" }, when: "$steps.ex.output.nothing" },
    { id: "last", command: "tts.speak", input: { text: { $ref: "$steps.v1.output.audio" } } },
  ] };
  const handlers = {
    "explainer.explain": async (i: any) => ({ lines: [`L1:${i.text}`, `L2:${i.text}`] }),
    "tts.speak": async (i: any) => ({ audio: `mp3(${i.text})` }),
  };
  it("resolves refs, runs parallel groups, honours when, dry-run reports inputs only", async () => {
    const r = await execute(plan, { handlers, catalogue: cat });
    expect(r.ok).toBe(true);
    expect(r.results.map((x) => x.status)).toEqual(["ok", "ok", "ok", "skipped", "ok"]);
    expect((r.outputs.last as any).audio).toBe("mp3(mp3(L1:hello))");
    const dry = await execute(plan, { handlers, dryRun: true });
    expect(dry.results.every((x) => x.status === "dry" || x.status === "skipped")).toBe(true);
    expect(dry.results[0]!.input).toEqual({ text: "hello", lang: "auto" });
  });
  it("stops after a required failure, continues past optional ones, applies timeouts and budget", async () => {
    const slow = { ...handlers, "tts.speak": () => new Promise((res) => setTimeout(() => res({ audio: "late" }), 80)) };
    const r = await execute({ steps: [
      { id: "a", command: "explainer.explain", input: { text: "t" } },
      { id: "b", command: "tts.speak", input: { text: "t" }, timeoutMs: 10, optional: true },
      { id: "c", command: "tts.speak", input: { text: "t" }, timeoutMs: 10 },
      { id: "d", command: "explainer.explain", input: { text: "never" } },
    ] }, { handlers: slow });
    expect(r.ok).toBe(false);
    expect(r.results.map((x) => x.status)).toEqual(["ok", "failed", "failed", "skipped"]);
    expect(r.results[1]!.error).toMatch(/timeout/);
    const budget = await execute({ steps: [{ id: "a", command: "tts.speak", input: { text: "1" } }, { id: "b", command: "tts.speak", input: { text: "2" } }], budgetMs: 1 }, { handlers: slow });
    expect(budget.results[1]!.status).toBe("skipped");
    const missing = await execute({ steps: [{ id: "a", command: "x.y" }] }, { handlers: {} });
    expect(missing.results[0]!.error).toMatch(/no handler/);
    const invalid = await execute({ steps: [{ id: "a", command: "x.y" }] }, { handlers: {}, catalogue: cat });
    expect(invalid.errors[0]!.message).toMatch(/unknown command/);
  });
  it("autoBind maps module functions by the (first required, rest) convention", async () => {
    const mod = { explain: (text: string, opts: any) => ({ got: text, opts }), other: 1 };
    const h = autoBind(mod, explainerDesc);
    expect(Object.keys(h)).toEqual(["explainer.explain"]);
    expect(await h["explainer.explain"]!({ text: "T", lang: "ne" }, {} as any)).toEqual({ got: "T", opts: { lang: "ne" } });
    const single = autoBind({ speak: (input: any) => input }, ttsDesc);
    expect(await single["tts.speak"]!({ text: "x" }, {} as any)).toEqual({ text: "x" });
    const p = planPrompt("Make a reel", cat);
    expect(p).toContain("Goal: Make a reel");
    expect(p).toContain("explainer.explain(");
    expect(describeApi().commands.map((c) => c.name)).toContain("execute");
  });
});
