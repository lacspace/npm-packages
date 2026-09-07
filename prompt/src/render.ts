/**
 * @lacspace/prompt — typed template engine.
 *
 * `prompt("You are {{role}}. Answer: {{question}}")` returns a {@link Prompt}
 * whose `.render(vars)` fills `{{name}}` placeholders. The required variable
 * names are inferred from the template string with TypeScript template-literal
 * types, so `.render()` is fully type-checked.
 */

/* ------------------------------------------------------------------ *
 * Runtime value types
 * ------------------------------------------------------------------ */

/** Any value you can pass into a template variable. */
export type PromptValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Prompt
  | PromptValue[]
  | { [key: string]: PromptValue };

/* ------------------------------------------------------------------ *
 * Type-level variable inference
 * ------------------------------------------------------------------ */

type Whitespace = " " | "\n" | "\t" | "\r";

/** Trim leading/trailing ASCII whitespace at the type level. */
type Trim<S extends string> = S extends `${Whitespace}${infer R}`
  ? Trim<R>
  : S extends `${infer L}${Whitespace}`
    ? Trim<L>
    : S;

/**
 * Extract the raw inner text of every `{{ ... }}` token in a template as a
 * tuple. A token preceded by a backslash (`\{{literal}}`) is treated as an
 * escape and skipped.
 */
type Tokens<S extends string> =
  S extends `${infer Pre}{{${infer Inner}}}${infer Rest}`
    ? Pre extends `${string}\\`
      ? Tokens<Rest>
      : [Inner, ...Tokens<Rest>]
    : [];

/**
 * Names that MUST be supplied — plain `{{name}}` with no inline default.
 * The outer `T extends string` makes the conditional distribute over the
 * union of tokens (the inner checks use `Trim<T>`, which would otherwise
 * suppress distribution).
 */
type ClassifyRequired<T extends string> = T extends string
  ? Trim<T> extends `#${string}`
    ? never // block open (#if / #unless / #each)
    : Trim<T> extends `/${string}`
      ? never // block close
      : Trim<T> extends `!${string}`
        ? never // comment
        : Trim<T> extends "." | "this"
          ? never // each-context reference
          : Trim<T> extends `@${string}`
            ? never // @index / @first / @last
            : Trim<T> extends `${string}:-${string}`
              ? never // has an inline default -> optional
              : Trim<T>
  : never;

/** Names that MAY be supplied — block keys and defaulted `{{k:-x}}`. */
type ClassifyOptional<T extends string> = T extends string
  ? Trim<T> extends `#if ${infer K}`
    ? Trim<K>
    : Trim<T> extends `#unless ${infer K}`
      ? Trim<K>
      : Trim<T> extends `#each ${infer K}`
        ? Trim<K>
        : Trim<T> extends `${infer K}:-${string}`
          ? Trim<K>
          : never
  : never;

/**
 * Remove `{{#each …}} … {{/each}}` spans so that variables used *inside* an
 * each-block (which resolve against each iteration item, not the top-level
 * vars) are not treated as statically required.
 */
type StripEach<S extends string> =
  S extends `${infer A}{{#each ${string}}}${string}{{/each}}${infer C}`
    ? `${A}${StripEach<C>}`
    : S;

/**
 * The union of required variable names inferred from template `S`. Variables
 * referenced only inside an `{{#each}}` block are excluded (they bind to the
 * iteration item at runtime).
 */
export type RequiredVars<S extends string> = ClassifyRequired<
  Tokens<StripEach<S>>[number]
>;

/** The union of optional variable names inferred from template `S`. */
export type OptionalVars<S extends string> = ClassifyOptional<
  Tokens<S>[number]
>;

/** The `vars` object shape that `.render()` expects for template `S`. */
export type RenderVars<S extends string> = {
  [K in RequiredVars<S>]: PromptValue;
} & {
  [K in OptionalVars<S>]?: PromptValue;
};

/**
 * When a template has no required variables, `.render()` can be called with no
 * argument; otherwise the `vars` argument is mandatory.
 */
export type RenderArgs<S extends string> = [RequiredVars<S>] extends [never]
  ? [vars?: RenderVars<S>]
  : [vars: RenderVars<S>];

/* ------------------------------------------------------------------ *
 * Parser (runtime)
 * ------------------------------------------------------------------ */

type Node =
  | { t: "text"; v: string }
  | { t: "var"; key: string; def?: string }
  | { t: "if"; key: string; body: Node[] }
  | { t: "unless"; key: string; body: Node[] }
  | { t: "each"; key: string; body: Node[] };

type Token = { text: string } | { tag: string };

const TOKEN_RE = /(\\?)\{\{([\s\S]*?)\}\}/g;

function tokenize(tpl: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(tpl))) {
    if (m.index > last) tokens.push({ text: tpl.slice(last, m.index) });
    const escaped = m[1] === "\\";
    const inner = m[2] ?? "";
    if (escaped) {
      // `\{{x}}` renders literally as `{{x}}`
      tokens.push({ text: `{{${inner}}}` });
    } else {
      tokens.push({ tag: inner.trim() });
    }
    last = TOKEN_RE.lastIndex;
  }
  if (last < tpl.length) tokens.push({ text: tpl.slice(last) });
  return tokens;
}

const BLOCKS = [
  { open: "#if ", close: "/if", t: "if" },
  { open: "#unless ", close: "/unless", t: "unless" },
  { open: "#each ", close: "/each", t: "each" },
] as const;

function parse(tokens: Token[], start: number, stop: string | null): [Node[], number] {
  const nodes: Node[] = [];
  let i = start;
  while (i < tokens.length) {
    const tk = tokens[i]!;
    if ("text" in tk) {
      nodes.push({ t: "text", v: tk.text });
      i++;
      continue;
    }
    const tag = tk.tag;
    if (stop && tag === stop) return [nodes, i];

    const block = BLOCKS.find((b) => tag.startsWith(b.open));
    if (block) {
      const key = tag.slice(block.open.length).trim();
      const [body, end] = parse(tokens, i + 1, block.close);
      if (end >= tokens.length) {
        throw new Error(`[@lacspace/prompt] Unclosed {{${block.open.trim()} ${key}}} block`);
      }
      nodes.push({ t: block.t, key, body } as Node);
      i = end + 1; // skip the closing tag
      continue;
    }

    if (tag.startsWith("/")) {
      throw new Error(`[@lacspace/prompt] Unexpected closing tag {{${tag}}}`);
    }
    if (tag.startsWith("!")) {
      // comment — emit nothing
      i++;
      continue;
    }

    // plain variable, possibly with an inline default `key:-default`
    const di = tag.indexOf(":-");
    if (di !== -1) {
      nodes.push({ t: "var", key: tag.slice(0, di).trim(), def: tag.slice(di + 2) });
    } else {
      nodes.push({ t: "var", key: tag });
    }
    i++;
  }
  if (stop) throw new Error(`[@lacspace/prompt] Unclosed {{${stop.replace("/", "#")}}} block`);
  return [nodes, i];
}

function compile(tpl: string): Node[] {
  return parse(tokenize(tpl), 0, null)[0];
}

/* ------------------------------------------------------------------ *
 * Renderer (runtime)
 * ------------------------------------------------------------------ */

type Scope = Record<string, unknown>;

function truthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === "object") return Object.keys(v).length > 0;
  if (typeof v === "number") return v !== 0 && !Number.isNaN(v);
  return !!v;
}

function resolve(key: string, scopes: Scope[]): { found: boolean; value: unknown } {
  if (key === "." || key === "this") {
    for (const f of scopes) if ("this" in f) return { found: true, value: f["this"] };
    return { found: false, value: undefined };
  }
  const path = key.split(".");
  const head = path[0]!;
  for (const f of scopes) {
    if (f && typeof f === "object" && head in f) {
      let cur: unknown = f[head];
      let ok = true;
      for (let j = 1; j < path.length; j++) {
        if (cur == null || typeof cur !== "object") {
          ok = false;
          break;
        }
        cur = (cur as Record<string, unknown>)[path[j]!];
      }
      return { found: ok, value: ok ? cur : undefined };
    }
  }
  return { found: false, value: undefined };
}

function stringify(v: unknown): string {
  if (isPrompt(v)) return v.render();
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function renderNodes(nodes: Node[], scopes: Scope[]): string {
  let out = "";
  for (const n of nodes) {
    if (n.t === "text") {
      out += n.v;
    } else if (n.t === "var") {
      const { found, value } = resolve(n.key, scopes);
      if (!found) {
        if (n.def !== undefined) out += n.def;
        else
          throw new Error(
            `[@lacspace/prompt] Missing variable "${n.key}". Provide it, add an inline default {{${n.key}:-…}}, or wrap it in {{#if ${n.key}}}…{{/if}}.`,
          );
      } else if (value === null || value === undefined) {
        out += n.def !== undefined ? n.def : "";
      } else {
        out += stringify(value);
      }
    } else if (n.t === "if") {
      if (truthy(resolve(n.key, scopes).value)) out += renderNodes(n.body, scopes);
    } else if (n.t === "unless") {
      if (!truthy(resolve(n.key, scopes).value)) out += renderNodes(n.body, scopes);
    } else if (n.t === "each") {
      const value = resolve(n.key, scopes).value;
      if (Array.isArray(value)) {
        const len = value.length;
        value.forEach((item, idx) => {
          const frame: Scope =
            item && typeof item === "object" && !Array.isArray(item)
              ? { ...(item as Scope) }
              : {};
          frame["this"] = item;
          frame["@index"] = idx;
          frame["@first"] = idx === 0;
          frame["@last"] = idx === len - 1;
          out += renderNodes(n.body, [frame, ...scopes]);
        });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Prompt
 * ------------------------------------------------------------------ */

/**
 * A compiled, typed template. Create one with {@link prompt}. Its `.render()`
 * argument is inferred from the template string, so missing or misspelled
 * variables are compile-time errors.
 */
export class Prompt<S extends string = string> {
  /** Internal brand used by {@link isPrompt}. */
  readonly __isPrompt = true as const;
  /** The raw template string. */
  readonly template: S;
  private ast: Node[] | undefined;

  constructor(template: S) {
    this.template = template;
  }

  /** Fill the template's `{{placeholders}}` and return the finished string. */
  render(...args: RenderArgs<S>): string {
    const vars = ((args as unknown[])[0] ?? {}) as Scope;
    if (!this.ast) this.ast = compile(this.template);
    const root: Scope = { ...vars, this: vars };
    return renderNodes(this.ast, [root]);
  }

  /** Same as {@link render} — lets a Prompt be used where a string is. */
  toString(): string {
    return this.template;
  }
}

/** True if `x` is a {@link Prompt}. */
export function isPrompt(x: unknown): x is Prompt {
  return !!x && typeof x === "object" && (x as { __isPrompt?: unknown }).__isPrompt === true;
}

/**
 * Build a typed prompt template. The required variable names are inferred from
 * the template string:
 *
 * ```ts
 * const p = prompt("You are {{role}}. Answer: {{question}}");
 * p.render({ role: "a tutor", question: "What is 2+2?" }); // ✅
 * p.render({ role: "a tutor" });                           // ✗ 'question' missing
 * ```
 */
export function prompt<S extends string>(template: S): Prompt<S> {
  return new Prompt(template);
}

/** Anything renderable to text: a plain string or a {@link Prompt}. */
export type Renderable = string | Prompt;

/** Coerce a {@link Renderable} to a string (rendering a Prompt with no vars). */
export function toText(x: Renderable): string {
  return isPrompt(x) ? x.render() : x;
}

/**
 * One-off render without building a Prompt first. Loosely typed — for a
 * dynamic template string. Prefer {@link prompt} when the template is a literal.
 */
export function render(template: string, vars?: Record<string, PromptValue>): string {
  return new Prompt(template).render(vars as never);
}
