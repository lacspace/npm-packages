/**
 * ICU MessageFormat parser + cross-locale validator.
 *
 * {@link extractPlaceholders} (in `placeholders.ts`) tokenizes a message into a
 * flat set of placeholders; this module goes deeper and builds an actual
 * MessageFormat AST so we can reason about plural/select structure. Supported:
 *
 *   {name}                          simple argument
 *   {v, number|date|time, style?}   formatted argument (style optional)
 *   {n, plural, offset:1 =0 {…} one {…} other {…}}   plural / selectordinal
 *   {g, select, male {…} other {…}} select
 *   nested arguments inside any submessage
 *
 * {@link parseIcu} never throws — structural problems are collected in `errors`
 * (mirroring `extractPlaceholders`). {@link checkIcu} compares a base message
 * against a target and reports argument mismatches and structural problems
 * (e.g. a plural/select missing its required `other` category). Plural
 * *categories* are intentionally NOT required to match across locales — a
 * language legitimately has different categories (English `one/other`, Polish
 * `one/few/many/other`) — only the required `other` and the argument set are.
 *
 * Limitation: ICU apostrophe quoting (`'{'` for a literal brace) is not
 * interpreted, consistent with the rest of the tool.
 */

/** Recognised ICU simple-argument function types. */
const ICU_FUNCS = new Set(["number", "date", "time", "spellout", "ordinal", "duration"]);
/** Valid CLDR plural keywords (besides explicit `=N`). */
const PLURAL_CATEGORIES = new Set(["zero", "one", "two", "few", "many", "other"]);

/** One branch of a plural/select, e.g. `one {# item}`. */
export interface IcuOption {
  selector: string;
  nodes: IcuNode[];
}

/** A node in a parsed ICU message. */
export type IcuNode =
  | { type: "text"; value: string }
  | { type: "arg"; name: string }
  | { type: "func"; name: string; fn: string; style: string | null }
  | { type: "plural"; name: string; kind: "plural" | "selectordinal"; offset: number; options: IcuOption[] }
  | { type: "select"; name: string; options: IcuOption[] };

/** Result of {@link parseIcu}: the AST plus any structural errors. */
export interface IcuParseResult {
  nodes: IcuNode[];
  errors: string[];
}

interface Cursor {
  s: string;
  i: number;
  errors: string[];
}

/** Parse an ICU MessageFormat string into an AST (never throws). */
export function parseIcu(message: string): IcuParseResult {
  const cur: Cursor = { s: message, i: 0, errors: [] };
  const nodes = parseNodes(cur, false);
  return { nodes, errors: cur.errors };
}

/** `true` when a message parses with no structural errors. */
export function isValidIcu(message: string): boolean {
  return parseIcu(message).errors.length === 0;
}

function skipWs(cur: Cursor): void {
  while (cur.i < cur.s.length && /\s/.test(cur.s[cur.i]!)) cur.i++;
}

/** Read a bare token (argument name / type / selector) up to a delimiter. */
function readToken(cur: Cursor): string {
  let out = "";
  while (cur.i < cur.s.length) {
    const ch = cur.s[cur.i]!;
    if (ch === "{" || ch === "}" || ch === "," || /\s/.test(ch)) break;
    out += ch;
    cur.i++;
  }
  return out;
}

/** Advance past the next top-level `}` (error recovery). */
function recover(cur: Cursor): void {
  let depth = 0;
  while (cur.i < cur.s.length) {
    const ch = cur.s[cur.i++]!;
    if (ch === "{") depth++;
    else if (ch === "}") {
      if (depth === 0) return;
      depth--;
    }
  }
}

/** Read until the matching top-level `}` (used for a simple-arg style). */
function readUntilCloseBrace(cur: Cursor): string {
  let out = "";
  let depth = 0;
  while (cur.i < cur.s.length) {
    const ch = cur.s[cur.i]!;
    if (ch === "}" && depth === 0) break;
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    out += ch;
    cur.i++;
  }
  return out;
}

function parseNodes(cur: Cursor, inSub: boolean): IcuNode[] {
  const nodes: IcuNode[] = [];
  let text = "";
  const flush = (): void => {
    if (text) {
      nodes.push({ type: "text", value: text });
      text = "";
    }
  };
  while (cur.i < cur.s.length) {
    const ch = cur.s[cur.i]!;
    if (ch === "}") {
      if (inSub) {
        flush();
        return nodes;
      }
      cur.errors.push("unexpected '}'");
      cur.i++;
    } else if (ch === "{") {
      flush();
      const node = parseArgument(cur);
      if (node) nodes.push(node);
      else return nodes; // error already recorded, bail out
    } else {
      text += ch;
      cur.i++;
    }
  }
  if (inSub) cur.errors.push("unbalanced '{' — missing '}'");
  flush();
  return nodes;
}

function parseArgument(cur: Cursor): IcuNode | null {
  cur.i++; // consume "{"
  skipWs(cur);
  const name = readToken(cur);
  if (name === "") {
    cur.errors.push("missing argument name");
    recover(cur);
    return null;
  }
  skipWs(cur);
  const ch = cur.s[cur.i];
  if (ch === "}") {
    cur.i++;
    return { type: "arg", name };
  }
  if (ch !== ",") {
    cur.errors.push(`expected ',' or '}' after argument "${name}"`);
    recover(cur);
    return null;
  }
  cur.i++; // consume ","
  skipWs(cur);
  const fn = readToken(cur);
  skipWs(cur);
  if (fn === "plural" || fn === "selectordinal") return parsePlural(cur, name, fn);
  if (fn === "select") return parseSelect(cur, name);

  // simple formatted argument: number/date/time/… with an optional style.
  let style: string | null = null;
  if (cur.s[cur.i] === ",") {
    cur.i++;
    style = readUntilCloseBrace(cur).trim() || null;
  }
  if (cur.s[cur.i] === "}") cur.i++;
  else cur.errors.push(`unbalanced '{' in argument "${name}"`);
  if (fn === "") cur.errors.push(`missing argument type after "${name}"`);
  else if (!ICU_FUNCS.has(fn)) cur.errors.push(`unknown ICU type "${fn}" for argument "${name}"`);
  return { type: "func", name, fn, style };
}

function parseOptions(cur: Cursor, name: string, label: string): IcuOption[] {
  const options: IcuOption[] = [];
  if (cur.s[cur.i] === ",") cur.i++;
  else cur.errors.push(`expected ',' before ${label} options for "${name}"`);
  skipWs(cur);
  while (cur.i < cur.s.length && cur.s[cur.i] !== "}") {
    const sel = readToken(cur);
    skipWs(cur);
    if (sel === "") {
      cur.errors.push(`malformed ${label} option in "${name}"`);
      recover(cur);
      return options;
    }
    if (label === "plural" && sel.startsWith("offset:")) {
      // offset:N carries no submessage braces — record it and move on.
      options.push({ selector: sel, nodes: [] });
      continue;
    }
    if (cur.s[cur.i] !== "{") {
      cur.errors.push(`expected '{' after "${sel}" in ${label} "${name}"`);
      recover(cur);
      return options;
    }
    cur.i++; // consume "{"
    const nodes = parseNodes(cur, true);
    if (cur.s[cur.i] === "}") cur.i++;
    options.push({ selector: sel, nodes });
    skipWs(cur);
  }
  if (cur.s[cur.i] === "}") cur.i++;
  else cur.errors.push(`unbalanced '{' in ${label} "${name}"`);
  return options;
}

function parsePlural(cur: Cursor, name: string, kind: "plural" | "selectordinal"): IcuNode {
  const raw = parseOptions(cur, name, kind);
  let offset = 0;
  const options: IcuOption[] = [];
  for (const o of raw) {
    if (o.selector.startsWith("offset:")) {
      offset = Number(o.selector.slice("offset:".length)) || 0;
      continue;
    }
    if (!o.selector.startsWith("=") && !PLURAL_CATEGORIES.has(o.selector)) {
      cur.errors.push(`unknown plural category "${o.selector}" in "${name}"`);
    }
    options.push(o);
  }
  return { type: "plural", name, kind, offset, options };
}

function parseSelect(cur: Cursor, name: string): IcuNode {
  const options = parseOptions(cur, name, "select");
  return { type: "select", name, options };
}

// --- cross-locale ICU comparison -----------------------------------------

/** Result of {@link checkIcu}. */
export interface IcuCheckResult {
  /** No malformed input and no cross-locale mismatch. */
  ok: boolean;
  /** Structural errors in the base message. */
  baseMalformed: string[];
  /** Structural errors in the target message. */
  targetMalformed: string[];
  /** Human-readable cross-locale problems. */
  mismatches: string[];
}

/** Map an argument name → its structural signature within an AST. */
function argSignatures(nodes: IcuNode[], out: Map<string, string> = new Map()): Map<string, string> {
  for (const n of nodes) {
    if (n.type === "arg") setSig(out, n.name, "simple");
    else if (n.type === "func") setSig(out, n.name, n.fn);
    else if (n.type === "plural") {
      setSig(out, n.name, n.kind);
      for (const o of n.options) argSignatures(o.nodes, out);
    } else if (n.type === "select") {
      setSig(out, n.name, "select");
      for (const o of n.options) argSignatures(o.nodes, out);
    }
  }
  return out;
}

function setSig(map: Map<string, string>, name: string, sig: string): void {
  if (!map.has(name)) map.set(name, sig);
}

/** Collect every plural/select node (recursively) for structural checks. */
function collectChoices(
  nodes: IcuNode[],
  out: Array<{ type: string; name: string; options: IcuOption[] }> = [],
): Array<{ type: string; name: string; options: IcuOption[] }> {
  for (const n of nodes) {
    if (n.type === "plural" || n.type === "select") {
      out.push({ type: n.type, name: n.name, options: n.options });
      for (const o of n.options) collectChoices(o.nodes, out);
    }
  }
  return out;
}

/**
 * Compare a base ICU message against a target. Reports malformed structure in
 * either, argument-set / argument-type mismatches, and any plural/select that
 * is missing the required `other` category. Plural categories are NOT required
 * to be identical across locales.
 */
export function checkIcu(base: string, target: string): IcuCheckResult {
  const b = parseIcu(base);
  const t = parseIcu(target);
  const mismatches: string[] = [];

  const bArgs = argSignatures(b.nodes);
  const tArgs = argSignatures(t.nodes);
  for (const [name, sig] of bArgs) {
    if (!tArgs.has(name)) mismatches.push(`argument {${name}} (${sig}) is missing in the target`);
    else if (tArgs.get(name) !== sig) {
      mismatches.push(`argument {${name}} type differs: base ${sig}, target ${tArgs.get(name)}`);
    }
  }
  for (const [name, sig] of tArgs) {
    if (!bArgs.has(name)) mismatches.push(`argument {${name}} (${sig}) is in the target but not in the base`);
  }

  for (const w of [
    { nodes: b.nodes, label: "base" },
    { nodes: t.nodes, label: "target" },
  ]) {
    for (const c of collectChoices(w.nodes)) {
      if (!c.options.some((o) => o.selector === "other")) {
        mismatches.push(`${w.label} ${c.type} {${c.name}} is missing the required 'other' branch`);
      }
    }
  }

  mismatches.sort();
  return {
    ok: b.errors.length === 0 && t.errors.length === 0 && mismatches.length === 0,
    baseMalformed: b.errors,
    targetMalformed: t.errors,
    mismatches,
  };
}
