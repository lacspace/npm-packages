/**
 * A recursive-descent parser for the read-only SQL subset this tool supports.
 * Produces a typed AST (see {@link SelectStatement}).
 *
 * v0.2.0 adds JOINs (INNER / LEFT / cross), table aliases and qualified column
 * references, scalar/arithmetic expressions and CASE in SELECT/WHERE, the
 * BETWEEN / NOT IN / NOT LIKE / LIKE … ESCAPE predicates, ORDER BY … NULLS
 * FIRST|LAST, UNION [ALL] and glob FROM. All backward compatible with v0.1.0.
 */
import { tokenize, SqlError } from "./tokenize.js";
import type { Token } from "./tokenize.js";

export type AggregateFn = "count" | "sum" | "avg" | "min" | "max";

/** A scalar operand: a column reference or a literal value (a subset of {@link ValueExpr}). */
export type Operand =
  | { kind: "column"; name: string }
  | { kind: "literal"; value: string | number | null };

/**
 * A scalar-valued expression. Columns and literals are the leaves; arithmetic,
 * scalar functions, CASE and aggregates build on them.
 */
export type ValueExpr =
  | { kind: "column"; name: string }
  | { kind: "literal"; value: string | number | null }
  | { kind: "unary"; op: "-" | "+"; expr: ValueExpr }
  | { kind: "binary"; op: "+" | "-" | "*" | "/" | "%"; left: ValueExpr; right: ValueExpr }
  | { kind: "func"; name: string; args: ValueExpr[] }
  | { kind: "case"; branches: Array<{ when: Expr; then: ValueExpr }>; else?: ValueExpr }
  | { kind: "aggregate"; fn: AggregateFn; arg: "*" | ValueExpr; distinct?: boolean };

/** An item in the SELECT list. */
export type SelectItem =
  | { kind: "star"; table?: string }
  | { kind: "column"; name: string; alias?: string }
  | { kind: "expr"; expr: ValueExpr; alias?: string }
  | { kind: "aggregate"; fn: AggregateFn; arg: "*" | string; argExpr?: ValueExpr; alias?: string; distinct?: boolean };

/** A WHERE / HAVING / ON expression node (boolean-valued). */
export type Expr =
  | { type: "or"; left: Expr; right: Expr }
  | { type: "and"; left: Expr; right: Expr }
  | { type: "not"; expr: Expr }
  | { type: "compare"; op: "=" | "!=" | "<" | "<=" | ">" | ">="; left: ValueExpr; right: ValueExpr }
  | { type: "like"; left: ValueExpr; pattern: string; negate: boolean; escape?: string }
  | { type: "in"; left: ValueExpr; values: Array<string | number | null>; negate: boolean }
  | { type: "between"; left: ValueExpr; lo: ValueExpr; hi: ValueExpr; negate: boolean }
  | { type: "isnull"; left: ValueExpr; negate: boolean };

export interface OrderItem {
  column: string;
  dir: "asc" | "desc";
  nulls?: "first" | "last";
}

/** A source of rows named in FROM / JOIN. */
export interface TableSource {
  kind: "path" | "name" | "glob";
  value: string;
}

/** One table in the FROM clause, with its (explicit or derived) alias. */
export interface TableRef {
  source: TableSource;
  alias: string;
}

/** A join of an additional table onto the ones before it. */
export interface JoinClause {
  kind: "inner" | "left" | "cross";
  table: TableRef;
  on?: Expr;
}

/** The parsed representation of a `SELECT` query. */
export interface SelectStatement {
  type: "select";
  distinct: boolean;
  columns: SelectItem[];
  /** The first table (kept for backward compatibility; mirrors `tables[0]`). */
  from: { kind: "path" | "name"; value: string };
  /** Every table in FROM, index 0 = the first/driving table. */
  tables: TableRef[];
  /** Joins for `tables[1..]` (comma cross-joins included). */
  joins: JoinClause[];
  where?: Expr;
  groupBy: string[];
  having?: Expr;
  orderBy: OrderItem[];
  limit?: number;
  offset?: number;
}

/** A top-level statement: a SELECT, or a UNION of statements. */
export type Statement =
  | SelectStatement
  | { type: "union"; all: boolean; left: Statement; right: Statement };

const AGGREGATES = new Set(["count", "sum", "avg", "min", "max"]);
const SCALAR_FNS = new Set([
  "upper", "lower", "trim", "length", "substr", "substring", "replace", "concat", "coalesce",
  "round", "abs", "floor", "ceil", "ceiling", "mod",
]);

class Parser {
  private toks: Token[];
  private pos = 0;

  constructor(sql: string) {
    this.toks = tokenize(sql);
  }

  private peek(off = 0): Token {
    return this.toks[this.pos + off] ?? this.toks[this.toks.length - 1]!;
  }
  private next(): Token {
    return this.toks[this.pos++]!;
  }
  private atEof(): boolean {
    return this.peek().type === "eof";
  }
  private isKeyword(kw: string): boolean {
    const t = this.peek();
    return t.type === "keyword" && t.value === kw;
  }
  private eatKeyword(kw: string): boolean {
    if (this.isKeyword(kw)) { this.pos++; return true; }
    return false;
  }
  private expectKeyword(kw: string): void {
    if (!this.eatKeyword(kw)) {
      const t = this.peek();
      throw new SqlError(`Expected '${kw.toUpperCase()}' but found '${t.value || t.type}'`, t.pos);
    }
  }
  private expect(type: Token["type"], label: string): Token {
    const t = this.peek();
    if (t.type !== type) throw new SqlError(`Expected ${label} but found '${t.value || t.type}'`, t.pos);
    return this.next();
  }
  private eatComma(): boolean {
    if (this.peek().type === "comma") { this.pos++; return true; }
    return false;
  }

  // ---- top level ----

  /** Parse a full statement, honouring UNION [ALL] chains. */
  parseStatement(): Statement {
    let left: Statement = this.parseSelect();
    while (this.isKeyword("union")) {
      this.next();
      const all = this.eatKeyword("all");
      const right = this.parseSelect();
      left = { type: "union", all, left, right };
    }
    if (!this.atEof()) {
      const t = this.peek();
      throw new SqlError(`Unexpected '${t.value || t.type}' after end of query`, t.pos);
    }
    return left;
  }

  /** Parse a single SELECT (no trailing UNION). */
  parseSelect(): SelectStatement {
    this.expectKeyword("select");
    const distinct = this.eatKeyword("distinct");
    const columns = this.parseSelectList();
    this.expectKeyword("from");
    const { tables, joins } = this.parseFrom();

    const first = tables[0]!;
    const from: { kind: "path" | "name"; value: string } =
      first.source.kind === "name"
        ? { kind: "name", value: first.source.value }
        : { kind: "path", value: first.source.value };

    const stmt: SelectStatement = {
      type: "select", distinct, columns, from, tables, joins, groupBy: [], orderBy: [],
    };

    if (this.eatKeyword("where")) stmt.where = this.parseExpr();
    if (this.isKeyword("group")) this.parseGroupBy(stmt);
    if (this.eatKeyword("having")) stmt.having = this.parseExpr();
    if (this.isKeyword("order")) this.parseOrderBy(stmt);
    this.parseLimitOffset(stmt);
    return stmt;
  }

  /** Parse a single SELECT and require EOF (public `parseSql`). */
  parseSingle(): SelectStatement {
    const stmt = this.parseSelect();
    if (!this.atEof()) {
      const t = this.peek();
      throw new SqlError(`Unexpected '${t.value || t.type}' after end of query`, t.pos);
    }
    return stmt;
  }

  // ---- SELECT list ----

  private parseSelectList(): SelectItem[] {
    const items: SelectItem[] = [];
    do {
      items.push(this.parseSelectItem());
    } while (this.eatComma());
    if (items.length === 0) throw new SqlError("SELECT needs at least one column", this.peek().pos);
    return items;
  }

  private parseSelectItem(): SelectItem {
    // `*`
    if (this.peek().type === "star") { this.next(); return { kind: "star" }; }
    // `alias.*` — the tokenizer glues `alias.` into one ident ending in "."
    const t0 = this.peek();
    if (t0.type === "ident" && t0.value.endsWith(".") && this.peek(1).type === "star") {
      this.next(); this.next();
      return { kind: "star", table: t0.value.slice(0, -1) };
    }

    // aggregate: NAME '(' … ')' at the top level → keep the dedicated shape
    const t = this.peek();
    if (t.type === "ident" && AGGREGATES.has(t.value.toLowerCase()) && this.peek(1).type === "lparen") {
      const item = this.parseAggregateItem();
      const alias = this.parseAlias();
      if (alias !== undefined) item.alias = alias;
      return item;
    }

    // plain column: a bare identifier not followed by an operator/paren
    if (t.type === "ident" && !this.startsExpression(1)) {
      this.next();
      const alias = this.parseAlias();
      const item: SelectItem = { kind: "column", name: t.value };
      if (alias !== undefined) item.alias = alias;
      return item;
    }

    // general value expression (arithmetic, scalar fns, CASE, literals, …)
    const expr = this.parseValueExpr();
    const alias = this.parseAlias();
    const item: SelectItem = { kind: "expr", expr };
    if (alias !== undefined) item.alias = alias;
    return item;
  }

  /** True when the token `off` places after a leading ident continues an expression. */
  private startsExpression(off: number): boolean {
    const t = this.peek(off);
    if (t.type === "arith" || t.type === "star") return true;
    if (t.type === "op") return true;
    if (t.type === "lparen") return true; // a function call: NAME(...)
    if (t.type === "ident" && t.value === "/") return true; // division `a / b`
    return false;
  }

  private parseAggregateItem(): Extract<SelectItem, { kind: "aggregate" }> {
    const fn = this.next().value.toLowerCase() as AggregateFn; // name
    this.expect("lparen", "'('");
    let arg: "*" | string = "*";
    let argExpr: ValueExpr | undefined;
    let distinct = false;
    if (this.peek().type === "star") {
      this.next(); arg = "*";
    } else {
      distinct = this.eatKeyword("distinct");
      const expr = this.parseValueExpr();
      if (expr.kind === "column") arg = expr.name;
      else { arg = describeExpr(expr); argExpr = expr; }
    }
    this.expect("rparen", "')'");
    const item: Extract<SelectItem, { kind: "aggregate" }> = { kind: "aggregate", fn, arg };
    if (argExpr) item.argExpr = argExpr;
    if (distinct) item.distinct = true;
    return item;
  }

  private parseAlias(): string | undefined {
    if (this.eatKeyword("as")) return this.expect("ident", "an alias").value;
    if (this.peek().type === "ident") return this.next().value;
    return undefined;
  }

  // ---- FROM / JOIN ----

  private parseFrom(): { tables: TableRef[]; joins: JoinClause[] } {
    const first = this.parseTableRef();
    const tables: TableRef[] = [first];
    const joins: JoinClause[] = [];
    const usedAliases = new Set<string>([first.alias.toLowerCase()]);

    for (;;) {
      if (this.eatComma()) {
        const table = this.parseTableRef();
        this.ensureAlias(table, usedAliases);
        joins.push({ kind: "cross", table });
        tables.push(table);
        continue;
      }
      const joinKind = this.tryJoinKeyword();
      if (!joinKind) break;
      const table = this.parseTableRef();
      this.ensureAlias(table, usedAliases);
      let on: Expr | undefined;
      if (this.eatKeyword("on")) on = this.parseExpr();
      else if (joinKind !== "cross") {
        const t = this.peek();
        throw new SqlError(`${joinKind.toUpperCase()} JOIN needs an ON condition`, t.pos);
      }
      const jc: JoinClause = { kind: joinKind, table };
      if (on) jc.on = on;
      joins.push(jc);
      tables.push(table);
    }
    return { tables, joins };
  }

  private ensureAlias(table: TableRef, used: Set<string>): void {
    const key = table.alias.toLowerCase();
    if (used.has(key)) {
      throw new SqlError(`Duplicate table alias '${table.alias}' — give each table a distinct alias`);
    }
    used.add(key);
  }

  /** Consume a JOIN keyword sequence (INNER/LEFT/CROSS [OUTER] JOIN); return its kind. */
  private tryJoinKeyword(): "inner" | "left" | "cross" | undefined {
    if (this.isKeyword("join")) { this.next(); return "inner"; }
    if (this.isKeyword("inner")) { this.next(); this.expectKeyword("join"); return "inner"; }
    if (this.isKeyword("cross")) { this.next(); this.expectKeyword("join"); return "cross"; }
    if (this.isKeyword("left")) {
      this.next(); this.eatKeyword("outer"); this.expectKeyword("join"); return "left";
    }
    if (this.isKeyword("right") || this.isKeyword("outer")) {
      const t = this.peek();
      throw new SqlError(`Only INNER, LEFT and CROSS joins are supported (found '${t.value}')`, t.pos);
    }
    return undefined;
  }

  private parseTableRef(): TableRef {
    const src = this.parseTableSource();
    const alias = this.parseTableAlias() ?? deriveAlias(src);
    return { source: src, alias };
  }

  private parseTableSource(): TableSource {
    const t = this.peek();
    if (t.type === "string") { this.next(); return { kind: isGlob(t.value) ? "glob" : "path", value: t.value }; }
    if (t.type === "ident") {
      this.next();
      if (isGlob(t.value)) return { kind: "glob", value: t.value };
      const looksLikePath = /[./\\]/.test(t.value);
      return { kind: looksLikePath ? "path" : "name", value: t.value };
    }
    throw new SqlError(`Expected a file path or table name after FROM but found '${t.value || t.type}'`, t.pos);
  }

  /** An optional table alias — a bare ident (with an optional AS) that isn't a clause keyword. */
  private parseTableAlias(): string | undefined {
    if (this.eatKeyword("as")) return this.expect("ident", "a table alias").value;
    if (this.peek().type === "ident") return this.next().value;
    return undefined;
  }

  // ---- WHERE / HAVING / ON expression grammar ----
  private parseExpr(): Expr {
    return this.parseOr();
  }
  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.eatKeyword("or")) left = { type: "or", left, right: this.parseAnd() };
    return left;
  }
  private parseAnd(): Expr {
    let left = this.parseNot();
    while (this.eatKeyword("and")) left = { type: "and", left, right: this.parseNot() };
    return left;
  }
  private parseNot(): Expr {
    if (this.eatKeyword("not")) return { type: "not", expr: this.parseNot() };
    return this.parseBooleanPrimary();
  }
  private parseBooleanPrimary(): Expr {
    // A parenthesised boolean group — but only when it really is one. A leading
    // '(' can also open a value expression like `(a + b) > 0`, so we peek.
    if (this.peek().type === "lparen" && this.parenIsBooleanGroup()) {
      this.next();
      const e = this.parseExpr();
      this.expect("rparen", "')'");
      return e;
    }
    return this.parsePredicate();
  }

  /** Heuristic: does the '(' at the cursor open a boolean group (vs a value expr)? */
  private parenIsBooleanGroup(): boolean {
    let depth = 0;
    for (let i = this.pos; i < this.toks.length; i++) {
      const t = this.toks[i]!;
      if (t.type === "lparen") depth++;
      else if (t.type === "rparen") { depth--; if (depth === 0) return false; }
      else if (depth === 1 && t.type === "keyword" &&
        (t.value === "and" || t.value === "or" || t.value === "not" ||
         t.value === "like" || t.value === "in" || t.value === "is" || t.value === "between")) {
        return true;
      } else if (depth === 1 && t.type === "op") {
        return true;
      } else if (t.type === "eof") break;
    }
    return false;
  }

  private parsePredicate(): Expr {
    const left = this.parseValueExpr();

    // IS [NOT] NULL
    if (this.eatKeyword("is")) {
      const negate = this.eatKeyword("not");
      this.expectKeyword("null");
      return { type: "isnull", left, negate };
    }

    // [NOT] LIKE / IN / BETWEEN
    let negate = false;
    if (this.eatKeyword("not")) {
      negate = true;
      if (this.isKeyword("like")) return this.finishLike(left, negate);
      if (this.isKeyword("in")) { this.next(); return { type: "in", left, values: this.parseInList(), negate }; }
      if (this.isKeyword("between")) return this.finishBetween(left, negate);
      const t = this.peek();
      throw new SqlError(`Expected LIKE, IN or BETWEEN after NOT but found '${t.value || t.type}'`, t.pos);
    }
    if (this.isKeyword("like")) return this.finishLike(left, negate);
    if (this.eatKeyword("in")) return { type: "in", left, values: this.parseInList(), negate };
    if (this.isKeyword("between")) return this.finishBetween(left, negate);

    // comparison
    const t = this.peek();
    if (t.type === "op") {
      this.next();
      const right = this.parseValueExpr();
      return { type: "compare", op: t.value as "=" | "!=" | "<" | "<=" | ">" | ">=", left, right };
    }
    throw new SqlError(`Expected a comparison operator, LIKE, IN, BETWEEN or IS NULL but found '${t.value || t.type}'`, t.pos);
  }

  private finishLike(left: ValueExpr, negate: boolean): Expr {
    this.expectKeyword("like");
    const pattern = this.expectStringLiteral("LIKE");
    const node: Expr = { type: "like", left, pattern, negate };
    if (this.eatKeyword("escape")) node.escape = this.expectStringLiteral("ESCAPE");
    return node;
  }

  private finishBetween(left: ValueExpr, negate: boolean): Expr {
    this.expectKeyword("between");
    const lo = this.parseValueExpr();
    this.expectKeyword("and");
    const hi = this.parseValueExpr();
    return { type: "between", left, lo, hi, negate };
  }

  private expectStringLiteral(label: string): string {
    const t = this.peek();
    if (t.type !== "string") throw new SqlError(`${label} expects a string but found '${t.value || t.type}'`, t.pos);
    this.next();
    return t.value;
  }

  private parseInList(): Array<string | number | null> {
    this.expect("lparen", "'(' after IN");
    const values: Array<string | number | null> = [];
    if (this.peek().type !== "rparen") {
      do {
        values.push(this.parseLiteralValue());
      } while (this.eatComma());
    }
    this.expect("rparen", "')'");
    return values;
  }

  // ---- value expression grammar (arithmetic / functions / CASE) ----

  private parseValueExpr(): ValueExpr {
    return this.parseAdditive();
  }

  private parseAdditive(): ValueExpr {
    let left = this.parseMultiplicative();
    for (;;) {
      const op = this.peekArith(["+", "-"]);
      if (!op) break;
      this.next();
      const right = this.parseMultiplicative();
      left = { kind: "binary", op, left, right };
    }
    return left;
  }

  private parseMultiplicative(): ValueExpr {
    let left = this.parseUnary();
    for (;;) {
      const op = this.peekArith(["*", "/", "%"]);
      if (!op) break;
      this.next();
      const right = this.parseUnary();
      left = { kind: "binary", op, left, right };
    }
    return left;
  }

  private parseUnary(): ValueExpr {
    const t = this.peek();
    if (t.type === "arith" && (t.value === "-" || t.value === "+")) {
      this.next();
      return { kind: "unary", op: t.value, expr: this.parseUnary() };
    }
    return this.parsePrimaryValue();
  }

  /** Return the arith operator at the cursor if it is one of `ops`. Handles `*` (star) and `/` (lone ident). */
  private peekArith(ops: string[]): "+" | "-" | "*" | "/" | "%" | undefined {
    const t = this.peek();
    if (t.type === "arith" && ops.includes(t.value)) return t.value as "+" | "-" | "%";
    if (t.type === "star" && ops.includes("*")) return "*";
    if (t.type === "ident" && t.value === "/" && ops.includes("/")) return "/";
    return undefined;
  }

  private parsePrimaryValue(): ValueExpr {
    const t = this.peek();

    if (t.type === "lparen") {
      this.next();
      const e = this.parseValueExpr();
      this.expect("rparen", "')'");
      return e;
    }

    if (this.isKeyword("case")) return this.parseCase();

    if (t.type === "string") { this.next(); return { kind: "literal", value: t.value }; }
    if (t.type === "number") { this.next(); return { kind: "literal", value: t.num! }; }
    if (t.type === "keyword" && t.value === "null") { this.next(); return { kind: "literal", value: null }; }

    if (t.type === "ident") {
      // function call: NAME '(' … ')'
      if (this.peek(1).type === "lparen") {
        const lower = t.value.toLowerCase();
        if (AGGREGATES.has(lower)) return this.parseAggregateValue();
        if (SCALAR_FNS.has(lower)) return this.parseFuncCall();
        throw new SqlError(`Unknown function '${t.value}'`, t.pos);
      }
      this.next();
      return { kind: "column", name: t.value };
    }

    throw new SqlError(`Expected a value, column, function or '(' but found '${t.value || t.type}'`, t.pos);
  }

  private parseAggregateValue(): ValueExpr {
    const item = this.parseAggregateItem();
    const node: Extract<ValueExpr, { kind: "aggregate" }> = {
      kind: "aggregate", fn: item.fn, arg: item.arg === "*" ? "*" : (item.argExpr ?? { kind: "column", name: item.arg }),
    };
    if (item.distinct) node.distinct = true;
    return node;
  }

  private parseFuncCall(): ValueExpr {
    const name = this.next().value.toLowerCase();
    this.expect("lparen", "'('");
    const args: ValueExpr[] = [];
    if (this.peek().type !== "rparen") {
      do { args.push(this.parseValueExpr()); } while (this.eatComma());
    }
    this.expect("rparen", "')'");
    return { kind: "func", name, args };
  }

  private parseCase(): ValueExpr {
    this.expectKeyword("case");
    const branches: Array<{ when: Expr; then: ValueExpr }> = [];
    while (this.eatKeyword("when")) {
      const when = this.parseExpr();
      this.expectKeyword("then");
      const then = this.parseValueExpr();
      branches.push({ when, then });
    }
    if (branches.length === 0) throw new SqlError("CASE needs at least one WHEN … THEN", this.peek().pos);
    const node: ValueExpr = { kind: "case", branches };
    if (this.eatKeyword("else")) node.else = this.parseValueExpr();
    this.expectKeyword("end");
    return node;
  }

  private parseLiteralValue(): string | number | null {
    const t = this.peek();
    if (t.type === "string") { this.next(); return t.value; }
    if (t.type === "number") { this.next(); return t.num!; }
    if (t.type === "arith" && (t.value === "-" || t.value === "+") && this.peek(1).type === "number") {
      this.next();
      const num = this.next().num!;
      return t.value === "-" ? -num : num;
    }
    if (t.type === "keyword" && t.value === "null") { this.next(); return null; }
    throw new SqlError(`Expected a literal value but found '${t.value || t.type}'`, t.pos);
  }

  // ---- tail clauses ----

  private parseGroupBy(stmt: SelectStatement): void {
    this.expectKeyword("group");
    this.expectKeyword("by");
    do {
      stmt.groupBy.push(this.expect("ident", "a column name").value);
    } while (this.eatComma());
  }

  private parseOrderBy(stmt: SelectStatement): void {
    this.expectKeyword("order");
    this.expectKeyword("by");
    do {
      const column = this.expect("ident", "a column name").value;
      let dir: "asc" | "desc" = "asc";
      if (this.eatKeyword("asc")) dir = "asc";
      else if (this.eatKeyword("desc")) dir = "desc";
      const item: OrderItem = { column, dir };
      if (this.eatKeyword("nulls")) {
        if (this.eatKeyword("first")) item.nulls = "first";
        else if (this.eatKeyword("last")) item.nulls = "last";
        else throw new SqlError("Expected FIRST or LAST after NULLS", this.peek().pos);
      }
      stmt.orderBy.push(item);
    } while (this.eatComma());
  }

  private parseLimitOffset(stmt: SelectStatement): void {
    if (this.eatKeyword("limit")) {
      stmt.limit = this.expectIntLiteral("LIMIT");
      if (this.eatKeyword("offset")) stmt.offset = this.expectIntLiteral("OFFSET");
      return;
    }
    if (this.eatKeyword("offset")) {
      stmt.offset = this.expectIntLiteral("OFFSET");
      if (this.eatKeyword("limit")) stmt.limit = this.expectIntLiteral("LIMIT");
    }
  }

  private expectIntLiteral(label: string): number {
    const t = this.peek();
    if (t.type !== "number") throw new SqlError(`${label} expects a number but found '${t.value || t.type}'`, t.pos);
    this.next();
    const n = t.num!;
    if (!Number.isInteger(n) || n < 0) throw new SqlError(`${label} expects a non-negative integer`, t.pos);
    return n;
  }
}

// ---- helpers ----

function isGlob(s: string): boolean {
  return /[*?]|\[[^\]]*\]/.test(s);
}

/** Derive a table alias from its source (basename without extension). */
export function deriveAlias(src: TableSource): string {
  let base = src.value;
  const slash = Math.max(base.lastIndexOf("/"), base.lastIndexOf("\\"));
  if (slash >= 0) base = base.slice(slash + 1);
  base = base.replace(/\.[A-Za-z0-9]+$/, "");
  base = base.replace(/[*?[\]]/g, "");
  base = base.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return base || "t";
}

/** A short, human label for an anonymous expression (used for default column keys). */
export function describeExpr(e: ValueExpr): string {
  switch (e.kind) {
    case "column": return e.name;
    case "literal": return e.value === null ? "NULL" : String(e.value);
    case "unary": return `${e.op}${describeExpr(e.expr)}`;
    case "binary": return `${describeExpr(e.left)} ${e.op} ${describeExpr(e.right)}`;
    case "func": return `${e.name.toUpperCase()}(${e.args.map(describeExpr).join(", ")})`;
    case "case": return "CASE";
    case "aggregate": return `${e.fn.toUpperCase()}(${e.arg === "*" ? "*" : (e.distinct ? "DISTINCT " : "") + describeExpr(e.arg)})`;
  }
}

/** Parse a SQL string into a single typed {@link SelectStatement} AST. Throws {@link SqlError}. */
export function parseSql(sql: string): SelectStatement {
  if (!sql || !sql.trim()) throw new SqlError("Empty query");
  return new Parser(sql).parseSingle();
}

/** Parse a SQL string into a {@link Statement} (a SELECT or a UNION chain). */
export function parseStatement(sql: string): Statement {
  if (!sql || !sql.trim()) throw new SqlError("Empty query");
  return new Parser(sql).parseStatement();
}
