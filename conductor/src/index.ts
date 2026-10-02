import { Schema, SchemaError, validate } from "./schema.js";

export { validate } from "./schema.js";
export type { Schema, SchemaError } from "./schema.js";

const VERSION = "1.0.0";

/** The shape every @lacspace newsroom package returns from describe(). */
export interface Descriptor {
  name: string;
  version: string;
  summary: string;
  commands: Array<{ name: string; input?: Schema; output?: string; description?: string }>;
  [k: string]: unknown;
}

export interface CatalogueCommand {
  /** "pkg.command" — package short name (without @lacspace/) + command name. */
  id: string;
  package: string;
  name: string;
  input?: Schema;
  output?: string;
  summary: string;
}

export interface Catalogue {
  packages: Array<{ name: string; version: string; summary: string; commands: string[] }>;
  commands: Record<string, CatalogueCommand>;
}

export function shortName(pkg: string): string {
  return pkg.replace(/^@lacspace\//, "");
}

/** Merge many describe() outputs into one catalogue keyed by "pkg.command". */
export function catalogue(items: Array<Descriptor | { describe(): Descriptor }>): Catalogue {
  const packages: Catalogue["packages"] = [];
  const commands: Catalogue["commands"] = {};
  for (const it of items) {
    const d = "describe" in it && typeof (it as any).describe === "function" ? (it as { describe(): Descriptor }).describe() : (it as Descriptor);
    const pkg = shortName(d.name);
    const ids: string[] = [];
    for (const c of d.commands ?? []) {
      const id = `${pkg}.${c.name}`;
      commands[id] = { id, package: pkg, name: c.name, input: c.input, output: c.output, summary: c.description ?? d.summary };
      ids.push(id);
    }
    packages.push({ name: d.name, version: d.version, summary: d.summary, commands: ids });
  }
  return { packages, commands };
}

/** A compact, token-light rendering of the catalogue for an LLM prompt (one line per command). */
export function catalogueForPrompt(cat: Catalogue, options: { maxChars?: number; packages?: string[] } = {}): string {
  const lines: string[] = [];
  for (const p of cat.packages) {
    if (options.packages && !options.packages.includes(shortName(p.name))) continue;
    lines.push(`## ${shortName(p.name)} — ${p.summary.split(/[.!?]\s/)[0]!.slice(0, 160)}`);
    for (const id of p.commands) {
      const c = cat.commands[id]!;
      const props = c.input?.properties ? Object.entries(c.input.properties).map(([k, s]) => `${k}${c.input!.required?.includes(k) ? "*" : ""}${s.enum ? `(${s.enum.join("|")})` : s.type ? `:${Array.isArray(s.type) ? s.type.join("|") : s.type}` : ""}`).join(", ") : "";
      lines.push(`- ${id}(${props})${c.output ? ` → ${c.output.slice(0, 120)}` : ""}`);
    }
  }
  let out = lines.join("\n");
  if (options.maxChars && out.length > options.maxChars) out = out.slice(0, options.maxChars - 1) + "…";
  return out;
}

// --- plans -------------------------------------------------------------------------
export interface Step {
  id: string;
  command: string;
  /** Inputs; any string of the form "$steps.<id>.output" or "$steps.<id>.output.<path>" (or an object {"$ref": …}) is resolved at run time. */
  input?: Record<string, unknown>;
  /** Run only when this ref resolves truthy. */
  when?: string;
  /** Failure doesn't stop the plan. */
  optional?: boolean;
  /** Per-step wall-clock budget. */
  timeoutMs?: number;
  /** Steps sharing a group run concurrently (after all earlier steps). */
  parallel?: string;
  note?: string;
}

export interface Plan {
  goal?: string;
  steps: Step[];
  /** Whole-plan wall-clock budget. */
  budgetMs?: number;
}

export interface PlanError {
  step?: string;
  message: string;
}

const REF_RE = /^\$steps\.([A-Za-z0-9_-]+)\.output(?:\.(.+))?$/;

function parseRef(v: unknown): { step: string; path?: string } | undefined {
  const s = typeof v === "string" ? v : v && typeof v === "object" && "$ref" in (v as any) ? String((v as any).$ref) : undefined;
  if (!s) return undefined;
  const m = s.match(REF_RE);
  return m ? { step: m[1]!, path: m[2] } : undefined;
}

function collectRefs(v: unknown, out: Array<{ step: string; path?: string }> = []): Array<{ step: string; path?: string }> {
  const r = parseRef(v);
  if (r) out.push(r);
  else if (Array.isArray(v)) v.forEach((x) => collectRefs(x, out));
  else if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach((x) => collectRefs(x, out));
  return out;
}

function getPath(obj: unknown, path?: string): unknown {
  if (!path) return obj;
  return path.split(".").reduce<any>((acc, k) => (acc == null ? undefined : acc[/^\d+$/.test(k) ? Number(k) : k]), obj);
}

/** Validate a plan (typically LLM-written) against the catalogue: commands exist, required inputs present, types/enums ok, refs point to earlier steps, ids unique. */
export function validatePlan(plan: Plan, cat: Catalogue): PlanError[] {
  const errors: PlanError[] = [];
  if (!plan || !Array.isArray(plan.steps) || !plan.steps.length) return [{ message: "plan.steps must be a non-empty array" }];
  const seen = new Set<string>();
  plan.steps.forEach((s, i) => {
    if (!s.id) errors.push({ message: `step ${i}: missing id` });
    else if (seen.has(s.id)) errors.push({ step: s.id, message: "duplicate step id" });
    const cmd = cat.commands[s.command];
    if (!cmd) { errors.push({ step: s.id, message: `unknown command "${s.command}"` }); seen.add(s.id); return; }
    const input = s.input ?? {};
    // Refs must point to earlier (non-parallel-sibling) steps.
    for (const r of [...collectRefs(input), ...(s.when ? collectRefs(s.when) : [])]) {
      if (!seen.has(r.step)) errors.push({ step: s.id, message: `ref to "${r.step}" which is not an earlier step` });
      else if (s.parallel && plan.steps.find((x) => x.id === r.step)?.parallel === s.parallel) errors.push({ step: s.id, message: `ref to "${r.step}" in the same parallel group` });
    }
    // Validate non-ref inputs against the schema (refs are typed at run time).
    const literal: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) if (!parseRef(v)) literal[k] = v;
    const schema = cmd.input;
    if (schema) {
      const errs = validate(literal, { ...schema, required: (schema.required ?? []).filter((r) => !(r in input)) });
      errors.push(...errs.map((e: SchemaError) => ({ step: s.id, message: `${e.path.replace(/^\$/, "input")}: ${e.message}` })));
    }
    seen.add(s.id);
  });
  return errors;
}

// --- execution ---------------------------------------------------------------------
export type Handler = (input: Record<string, unknown>, ctx: { step: Step; signal: AbortSignal }) => Promise<unknown> | unknown;

export interface StepResult {
  id: string;
  command: string;
  status: "ok" | "failed" | "skipped" | "dry";
  ms: number;
  input?: Record<string, unknown>;
  output?: unknown;
  error?: string;
}

export interface ExecuteOptions {
  handlers: Record<string, Handler>;
  /** Resolve inputs and report, but call nothing. */
  dryRun?: boolean;
  /** Default per-step timeout (ms). */
  timeoutMs?: number;
  /** Whole-plan budget (ms); remaining steps are skipped once exceeded. */
  budgetMs?: number;
  onStep?: (r: StepResult) => void;
  /** Validate against this catalogue first and refuse to run an invalid plan. */
  catalogue?: Catalogue;
}

export interface ExecuteResult {
  ok: boolean;
  results: StepResult[];
  outputs: Record<string, unknown>;
  totalMs: number;
  errors: PlanError[];
}

function resolve(v: unknown, outputs: Record<string, unknown>): unknown {
  const r = parseRef(v);
  if (r) return getPath(outputs[r.step], r.path);
  if (Array.isArray(v)) return v.map((x) => resolve(x, outputs));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, resolve(x, outputs)]));
  return v;
}

/** Run a plan step by step (parallel groups concurrently), resolving refs, with per-step timeouts and a total budget. */
export async function execute(plan: Plan, o: ExecuteOptions): Promise<ExecuteResult> {
  const t0 = Date.now();
  const errors = o.catalogue ? validatePlan(plan, o.catalogue) : [];
  if (errors.length) return { ok: false, results: [], outputs: {}, totalMs: 0, errors };
  const outputs: Record<string, unknown> = {};
  const results: StepResult[] = [];
  const budget = o.budgetMs ?? plan.budgetMs;
  let stopped = false;

  const runOne = async (s: Step): Promise<StepResult> => {
    const start = Date.now();
    const rec = (r: Omit<StepResult, "id" | "command" | "ms">): StepResult => {
      const out = { id: s.id, command: s.command, ms: Date.now() - start, ...r };
      results.push(out); o.onStep?.(out); return out;
    };
    if (stopped) return rec({ status: "skipped", error: "stopped after a failure or budget" });
    if (budget !== undefined && Date.now() - t0 > budget) { stopped = true; return rec({ status: "skipped", error: "plan budget exceeded" }); }
    if (s.when !== undefined && !resolve(s.when, outputs)) return rec({ status: "skipped", error: "when-condition false" });
    const input = resolve(s.input ?? {}, outputs) as Record<string, unknown>;
    if (o.dryRun) { outputs[s.id] = undefined; return rec({ status: "dry", input }); }
    const h = o.handlers[s.command];
    if (!h) { if (!s.optional) stopped = true; return rec({ status: "failed", input, error: `no handler for "${s.command}"` }); }
    const ac = new AbortController();
    const timeout = s.timeoutMs ?? o.timeoutMs;
    try {
      const work = Promise.resolve(h(input, { step: s, signal: ac.signal }));
      const output = timeout
        ? await Promise.race([work, new Promise<never>((_, rej) => setTimeout(() => { ac.abort(); rej(new Error(`timeout after ${timeout} ms`)); }, timeout))])
        : await work;
      outputs[s.id] = output;
      return rec({ status: "ok", input, output });
    } catch (e) {
      if (!s.optional) stopped = true;
      return rec({ status: "failed", input, error: (e as Error).message ?? String(e) });
    }
  };

  // Group consecutive steps sharing a `parallel` tag.
  let i = 0;
  while (i < plan.steps.length) {
    const s = plan.steps[i]!;
    if (s.parallel) {
      const group: Step[] = [];
      while (i < plan.steps.length && plan.steps[i]!.parallel === s.parallel) group.push(plan.steps[i++]!);
      await Promise.all(group.map(runOne));
    } else { await runOne(s); i++; }
  }
  return { ok: results.every((r) => r.status === "ok" || r.status === "dry" || (r.status === "skipped" && r.error === "when-condition false") || plan.steps.find((s) => s.id === r.id)?.optional === true), results, outputs, totalMs: Date.now() - t0, errors: [] };
}

/**
 * Build handlers from a module + its descriptor. Convention: if the function takes ≥ 2 parameters
 * and the schema has a first required key, call fn(input[first], restOfInput); otherwise fn(input).
 * Override any command with `overrides`.
 */
export function autoBind(mod: Record<string, unknown>, desc: Descriptor, overrides: Record<string, Handler> = {}): Record<string, Handler> {
  const pkg = shortName(desc.name);
  const out: Record<string, Handler> = {};
  for (const c of desc.commands ?? []) {
    const id = `${pkg}.${c.name}`;
    if (overrides[c.name]) { out[id] = overrides[c.name]!; continue; }
    const fn = mod[c.name];
    if (typeof fn !== "function") continue;
    const first = c.input?.required?.[0];
    out[id] = (input) => {
      if ((fn as Function).length >= 2 && first && first in input) {
        const { [first]: head, ...rest } = input;
        return (fn as Function)(head, rest);
      }
      return (fn as Function)(input);
    };
  }
  return out;
}

/** Prompt for an LLM to write a plan against the catalogue (the only AI-shaped part of the kit). */
export function planPrompt(goal: string, cat: Catalogue, options: { maxChars?: number; packages?: string[]; example?: Plan } = {}): string {
  const example: Plan = options.example ?? {
    goal: "Short video from an article",
    steps: [
      { id: "brief", command: "explainer.explain", input: { text: "<article>", lang: "auto" } },
      { id: "voice", command: "tts.speak", input: { text: "$steps.brief.output.script.scenes.0.voiceover", lang: "ne" } },
      { id: "caps", command: "captionsync.captions", input: { segments: "$steps.voice.output.segments", canvas: "reels" }, optional: true },
    ],
  };
  return [
    `You are the conductor of a deterministic newsroom toolkit. Reach the goal by composing ONLY the commands below; never invent commands, inputs or facts.`,
    `Goal: ${goal}`,
    ``,
    `Commands (name(inputs) → output; * = required):`,
    catalogueForPrompt(cat, options),
    ``,
    `Reply with JSON only: { "goal": string, "steps": [ { "id": string, "command": "pkg.command", "input": object, "optional"?: boolean, "when"?: "$steps.<id>.output.<path>", "parallel"?: string } ] }.`,
    `Reference earlier outputs with "$steps.<id>.output.<path>". Keep ids short. Example:`,
    JSON.stringify(example),
  ].join("\n");
}

/** Machine-readable descriptor for … itself. */
export function describe() {
  return {
    name: "@lacspace/conductor",
    version: VERSION,
    summary: "Drive every describe()-capable @lacspace package through one interface: merge descriptors into a command catalogue, render it token-light for an LLM, validate an AI-written plan against the schemas (commands, required inputs, types/enums, refs), and execute it step by step with ref resolution, parallel groups, per-step timeouts, a total budget, optional steps and dry-run.",
    commands: [
      { name: "catalogue", input: { type: "object", properties: { descriptors: { type: "array" } }, required: ["descriptors"] }, output: "Catalogue { packages, commands }" },
      { name: "validatePlan", input: { type: "object", properties: { plan: { type: "object" }, catalogue: { type: "object" } }, required: ["plan", "catalogue"] }, output: "PlanError[]" },
      { name: "execute", input: { type: "object", properties: { plan: { type: "object" }, handlers: { type: "object" }, dryRun: { type: "boolean" }, timeoutMs: { type: "number" }, budgetMs: { type: "number" } }, required: ["plan", "handlers"] }, output: "{ ok, results, outputs, totalMs, errors }" },
      { name: "planPrompt", input: { type: "object", properties: { goal: { type: "string" }, catalogue: { type: "object" }, maxChars: { type: "integer" } }, required: ["goal", "catalogue"] }, output: "string" },
    ],
  };
}
