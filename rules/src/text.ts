/**
 * A small text form of the rule JSON, so an AI (or a person) can write
 *
 *   name: EMA cross with RSI filter
 *   buy when ema(20) crosses above ema(50) and rsi(14) > 50
 *   sell when ema(20) crosses below ema(50)
 *   stop 2 atr
 *
 * instead of JSON. `parseRules(text)` → Rules (validated by cleanRules) with line/column
 * errors; `rulesToText(rules)` prints the canonical form, and parse(print(r)) round-trips.
 */

import { cleanRules, type Cond, type Group, type Op, type Operand, type Rules, type Src } from "./strategy";

export interface ParseError {
  line: number;
  col: number;
  message: string;
}

export interface ParseResult {
  rules: Rules | null;
  errors: ParseError[];
}

const SRC = ["close", "open", "high", "low", "volume"] as const;

/** Function name → operand kind and its parameter names, in order. */
const FUNCS: Record<string, { k: Operand["k"]; params: string[] }> = {
  sma: { k: "sma", params: ["n", "src"] },
  ema: { k: "ema", params: ["n", "src"] },
  rsi: { k: "rsi", params: ["n"] },
  macd: { k: "macd", params: ["f", "s", "g"] },
  macd_signal: { k: "macdSignal", params: ["f", "s", "g"] },
  macd_hist: { k: "macdHist", params: ["f", "s", "g"] },
  atr: { k: "atr", params: ["n"] },
  bb_upper: { k: "bbUpper", params: ["n", "m"] },
  bb_mid: { k: "bbMid", params: ["n", "m"] },
  bb_lower: { k: "bbLower", params: ["n", "m"] },
  supertrend_dir: { k: "stDir", params: ["n", "m"] },
  highest: { k: "highest", params: ["n"] },
  lowest: { k: "lowest", params: ["n"] },
  vol_avg: { k: "volAvg", params: ["n"] },
  change: { k: "change", params: ["n"] },
};
const ALIASES: Record<string, string> = {
  macdsignal: "macd_signal", signal: "macd_signal", macdhist: "macd_hist", histogram: "macd_hist",
  bbupper: "bb_upper", upper_band: "bb_upper", bbmid: "bb_mid", bbmiddle: "bb_mid", bb_middle: "bb_mid", bblower: "bb_lower", lower_band: "bb_lower",
  stdir: "supertrend_dir", supertrend: "supertrend_dir", st_dir: "supertrend_dir",
  volavg: "vol_avg", avg_volume: "vol_avg", volume_avg: "vol_avg", roc: "change", pct_change: "change",
};
const NAME_OF: Record<string, string> = Object.fromEntries(Object.entries(FUNCS).map(([name, f]) => [f.k, name]));

/* ── tokenizer ──────────────────────────────────────────────────────────── */

type Tok = { t: "num" | "word" | "op" | "punct"; v: string; col: number };

function tokenize(s: string, line: number, errors: ParseError[]): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (/\s/.test(c)) { i++; continue; }
    const col = i + 1;
    const num = /^-?\d+(?:\.\d+)?/.exec(s.slice(i));
    if (num && (c !== "-" || !out.length || out[out.length - 1]!.t === "op" || out[out.length - 1]!.v === "(" || out[out.length - 1]!.v === ",")) {
      out.push({ t: "num", v: num[0], col }); i += num[0].length; continue;
    }
    const w = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
    if (w) { out.push({ t: "word", v: w[0].toLowerCase(), col }); i += w[0].length; continue; }
    if (c === ">" || c === "<") { out.push({ t: "op", v: c, col }); i++; continue; }
    if ("(),*×".includes(c)) { out.push({ t: "punct", v: c === "×" ? "*" : c, col }); i++; continue; }
    errors.push({ line, col, message: `Unexpected character "${c}"` });
    i++;
  }
  return out;
}

/* ── parser ─────────────────────────────────────────────────────────────── */

class LineParser {
  i = 0;
  constructor(private toks: Tok[], private line: number, private errors: ParseError[]) {}
  peek(o = 0) { return this.toks[this.i + o]; }
  fail(message: string, tok = this.peek()): never {
    this.errors.push({ line: this.line, col: tok?.col ?? (this.toks.at(-1)?.col ?? 0) + 1, message });
    throw new Error("parse");
  }

  operand(): Operand {
    const t = this.peek();
    if (!t) this.fail("Expected a value (a number, close, rsi(14), …)");
    if (t.t === "num") { this.i++; return { k: "num", v: Number(t.v) }; }
    if (t.t !== "word") this.fail(`Expected a value, got "${t.v}"`);
    this.i++;
    if ((SRC as readonly string[]).includes(t.v) && this.peek()?.v !== "(") return { k: "price", src: t.v as Src };
    if (t.v === "price") return { k: "price", src: "close" };
    const name = ALIASES[t.v] ?? t.v;
    const fn = FUNCS[name];
    if (!fn) this.fail(`Unknown indicator "${t.v}". Known: ${[...SRC, ...Object.keys(FUNCS)].join(", ")}`, t);
    const args: (number | string)[] = [];
    if (this.peek()?.v === "(") {
      this.i++;
      while (this.peek() && this.peek()!.v !== ")") {
        const a = this.peek()!;
        if (a.t === "num") args.push(Number(a.v));
        else if (a.t === "word" && (SRC as readonly string[]).includes(a.v)) args.push(a.v);
        else this.fail(`Bad argument "${a.v}" for ${name}()`, a);
        this.i++;
        if (this.peek()?.v === ",") this.i++;
        else if (this.peek()?.v !== ")") this.fail(`Expected "," or ")" in ${name}()`);
      }
      if (this.peek()?.v !== ")") this.fail(`Missing ")" after ${name}(`);
      this.i++;
    }
    if (args.length > fn.params.length) this.fail(`${name}() takes at most ${fn.params.length} argument(s): ${fn.params.join(", ")}`, t);
    const o: Record<string, unknown> = { k: fn.k };
    args.forEach((a, j) => {
      const p = fn.params[j]!;
      if (p === "src") { if (typeof a !== "string") this.fail(`${name}(): the 2nd argument is a price field (close, open, high, low, volume)`, t); o.src = a; }
      else { if (typeof a !== "number") this.fail(`${name}(): "${p}" must be a number`, t); o[p] = a; }
    });
    // n is required for indicators that have one.
    if (fn.params[0] === "n" && o.n === undefined) this.fail(`${name}() needs a length, e.g. ${name}(14)`, t);
    return o as Operand;
  }

  op(): Op {
    const t = this.peek();
    if (t?.t === "op") { this.i++; return t.v as Op; }
    const w = (o: number) => this.peek(o)?.v;
    if (w(0) === "crosses" || w(0) === "crossed" || w(0) === "cross") {
      const dir = w(1);
      if (dir === "above" || dir === "over" || dir === "up") { this.i += 2; return "crossAbove"; }
      if (dir === "below" || dir === "under" || dir === "down") { this.i += 2; return "crossBelow"; }
      this.fail('Expected "above" or "below" after "crosses"', this.peek(1));
    }
    if (w(0) === "crossabove") { this.i++; return "crossAbove"; }
    if (w(0) === "crossbelow") { this.i++; return "crossBelow"; }
    if (w(0) === "is" || w(0) === "above" || w(0) === "below") {
      if (w(0) === "is") this.i++;
      if (w(0) === "above" || w(0) === "over") { this.i++; return ">"; }
      if (w(0) === "below" || w(0) === "under") { this.i++; return "<"; }
    }
    this.fail(`Expected a comparison (>, <, crosses above, crosses below)${t ? `, got "${t.v}"` : ""}`);
  }

  cond(): Cond {
    const a = this.operand();
    const op = this.op();
    let mul: number | undefined;
    if (this.peek()?.t === "num" && this.peek(1)?.v === "*") { mul = Number(this.peek()!.v); this.i += 2; }
    const b = this.operand();
    if (this.peek()?.v === "*" && b.k !== "num") this.fail('Put the multiplier first: "volume > 1.5 * vol_avg(20)"');
    return { a, op, b, ...(mul !== undefined && mul !== 1 ? { mul } : {}) };
  }

  group(): Group {
    const conds = [this.cond()];
    let mode: "all" | "any" | null = null;
    while (this.peek()) {
      const t = this.peek()!;
      if (t.v !== "and" && t.v !== "or") this.fail(`Expected "and", "or" or the end of the line, got "${t.v}"`);
      const m = t.v === "and" ? "all" : "any";
      if (mode && mode !== m) this.fail('Use only "and" or only "or" on one line (put the other kind on separate rules)', t);
      mode = m;
      this.i++;
      conds.push(this.cond());
    }
    return { mode: mode ?? "all", conds };
  }
}

const HEADS: [RegExp, "entry" | "exit"][] = [
  [/^(?:buy|enter|long|entry)\s*(?:when|if|:)?\s*:?/i, "entry"],
  [/^(?:sell|exit|close)\s*(?:when|if|:)?\s*:?/i, "exit"],
];

/** Parse the text form into validated Rules, with line/column errors. */
export function parseRules(text: string): ParseResult {
  const errors: ParseError[] = [];
  const raw: Record<string, unknown> = { entry: { mode: "all", conds: [] }, exit: { mode: "any", conds: [] } };
  const lines = text.split(/\r?\n|;/);
  lines.forEach((full, idx) => {
    const lineNo = idx + 1;
    const lineText = full.replace(/#.*$/, "").trim();
    if (!lineText) return;
    const name = /^name\s*:\s*(.+)$/i.exec(lineText);
    if (name) { raw.name = name[1]!.trim(); return; }
    const sl = /^(stop|stoploss|stop_loss|target|take_profit)\s*(?:at|=|:)?\s*(\d+(?:\.\d+)?)\s*(?:x|×|\*)?\s*atr\b/i.exec(lineText);
    if (sl) { raw[/^(stop)/i.test(sl[1]!) ? "stopAtr" : "targetAtr"] = Number(sl[2]); return; }
    const head = HEADS.find(([re]) => re.test(lineText));
    if (!head) { errors.push({ line: lineNo, col: 1, message: 'Start the line with "buy when", "sell when", "stop N atr", "target N atr" or "name:"' }); return; }
    const offset = lineText.match(head[0])![0].length;
    const body = lineText.slice(offset);
    const toks = tokenize(body, lineNo, errors).map((t) => ({ ...t, col: t.col + offset + (full.length - full.trimStart().length) }));
    try {
      const g = new LineParser(toks, lineNo, errors).group();
      const prev = raw[head[1]] as Group;
      if (prev.conds.length) {
        if (g.conds.length > 1 && g.mode !== prev.mode) { errors.push({ line: lineNo, col: 1, message: `All ${head[1]} lines must use the same "and"/"or"` }); return; }
        prev.conds.push(...g.conds);
      } else raw[head[1]] = { mode: g.conds.length > 1 ? g.mode : head[1] === "exit" ? "any" : "all", conds: g.conds };
    } catch { /* error recorded */ }
  });
  const entry = raw.entry as Group;
  if (!errors.length && !entry.conds.length) errors.push({ line: 1, col: 1, message: 'No entry rule: add a line like "buy when close > ema(50)"' });
  if (errors.length) return { rules: null, errors };
  if (!raw.name) raw.name = "My strategy";
  const rules = cleanRules(raw);
  return rules ? { rules, errors: [] } : { rules: null, errors: [{ line: 1, col: 1, message: "The rules are not valid" }] };
}

/* ── printer ────────────────────────────────────────────────────────────── */

const fmt = (n: number) => String(Number(n.toFixed(6)));

/** One operand in text form: `close`, `ema(50)`, `ema(20, high)`, `macd(12, 26, 9)`. */
export function operandToText(o: Operand): string {
  if (o.k === "num") return fmt(o.v);
  if (o.k === "price") return o.src;
  const name = NAME_OF[o.k]!;
  const fn = FUNCS[name]!;
  const r = o as Record<string, unknown>;
  const args = fn.params
    .filter((p) => r[p] !== undefined && !(p === "src" && r[p] === "close"))
    .map((p) => (typeof r[p] === "number" ? fmt(r[p] as number) : String(r[p])));
  // macd family: print defaults explicitly so the text is self-describing.
  if (fn.params[0] === "f") return `${name}(${[r.f ?? 12, r.s ?? 26, r.g ?? 9].map((x) => fmt(x as number)).join(", ")})`;
  return args.length ? `${name}(${args.join(", ")})` : name;
}

const OP_TEXT: Record<Op, string> = { ">": ">", "<": "<", crossAbove: "crosses above", crossBelow: "crosses below" };

/** One condition: `volume > 1.5 * vol_avg(20)`. */
export function condToText(c: Cond): string {
  return `${operandToText(c.a)} ${OP_TEXT[c.op]} ${c.mul && c.mul !== 1 ? `${fmt(c.mul)} * ` : ""}${operandToText(c.b)}`;
}

/** Canonical text form of rules. `parseRules(rulesToText(r)).rules` equals `cleanRules(r)`. */
export function rulesToText(r: Rules): string {
  const g = (x: Group) => x.conds.map(condToText).join(x.mode === "all" ? " and " : " or ");
  const lines = [`name: ${r.name}`, `buy when ${g(r.entry)}`];
  if (r.exit.conds.length) lines.push(`sell when ${g(r.exit)}`);
  if (r.stopAtr) lines.push(`stop ${fmt(r.stopAtr)} atr`);
  if (r.targetAtr) lines.push(`target ${fmt(r.targetAtr)} atr`);
  return lines.join("\n");
}
