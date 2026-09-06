/**
 * A recursive-descent parser for the read-only SQL subset this tool supports.
 * Produces a typed AST (see {@link SelectStatement}). Single table only — no
 * JOINs, subqueries or writes.
 */
import { tokenize, SqlError } from "./tokenize.js";
import type { Token } from "./tokenize.js";

export type AggregateFn = "count" | "sum" | "avg" | "min" | "max";

/** A scalar operand: a column reference or a literal value. */
export type Operand =
  | { kind: "column"; name: string }
  | { kind: "literal"; value: string | number | null };

/** An item in the SELECT list. */
export type SelectItem =
  | { kind: "star" }
  | { kind: "column"; name: string; alias?: string }
  | { kind: "aggregate"; fn: AggregateFn; arg: "*" | string; alias?: string; distinct?: boolean };

/** A WHERE / HAVING expression node. */
export type Expr =
  | { type: "or"; left: Expr; right: Expr }
  | { type: "and"; left: Expr; right: Expr }
  | { type: "not"; expr: Expr }
  | { type: "compare"; op: "=" | "!=" | "<" | "<=" | ">" | ">="; left: Operand; right: Operand }
  | { type: "like"; left: Operand; pattern: string; negate: boolean }
  | { type: "in"; left: Operand; values: Array<string | number | null>; negate: boolean }
  | { type: "isnull"; left: Operand; negate: boolean };

export interface OrderItem {
  column: string;
  dir: "asc" | "desc";
}

/** The parsed representation of a `SELECT` query. */
export interface SelectStatement {
  type: "select";
  distinct: boolean;
  columns: SelectItem[];
  from: { kind: "path" | "name"; value: string };
  where?: Expr;
  groupBy: string[];
  having?: Expr;
  orderBy: OrderItem[];
  limit?: number;
  offset?: number;
}

class Parser {
  private toks: Token[];
  private pos = 0;

  constructor(sql: string) {
    this.toks = tokenize(sql);
  }

  private peek(): Token {
    return this.toks[this.pos]!;
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

  parse(): SelectStatement {
    this.expectKeyword("select");
    const distinct = this.eatKeyword("distinct");
    const columns = this.parseSelectList();
    this.expectKeyword("from");
    const from = this.parseFrom();

    const stmt: SelectStatement = { type: "select", distinct, columns, from, groupBy: [], orderBy: [] };

    if (this.eatKeyword("where")) stmt.where = this.parseExpr();
    if (this.isKeyword("group")) { this.parseGroupBy(stmt); }
    if (this.eatKeyword("having")) stmt.having = this.parseExpr();
    if (this.isKeyword("order")) { this.parseOrderBy(stmt); }
    this.parseLimitOffset(stmt);

    if (!this.atEof()) {
      const t = this.peek();
      throw new SqlError(`Unexpected '${t.value || t.type}' after end of query`, t.pos);
    }
    return stmt;
  }

  private parseSelectList(): SelectItem[] {
    const items: SelectItem[] = [];
    do {
      items.push(this.parseSelectItem());
    } while (this.eatComma());
    if (items.length === 0) throw new SqlError("SELECT needs at least one column", this.peek().pos);
    return items;
  }

  private eatComma(): boolean {
    if (this.peek().type === "comma") { this.pos++; return true; }
    return false;
  }

  private parseSelectItem(): SelectItem {
    // `*`
    if (this.peek().type === "star") {
      this.next();
      return { kind: "star" };
    }
    // aggregate: IDENT '(' ... ')'
    const t = this.peek();
    if (t.type === "ident" && this.isAggregateName(t.value) && this.toks[this.pos + 1]?.type === "lparen") {
      const fn = t.value.toLowerCase() as AggregateFn;
      this.next(); // fn name
      this.next(); // (
      let arg: "*" | string;
      let distinct = false;
      if (this.peek().type === "star") { this.next(); arg = "*"; }
      else {
        distinct = this.eatKeyword("distinct");
        arg = this.expect("ident", "a column name").value;
      }
      this.expect("rparen", "')'");
      const alias = this.parseAlias();
      const item: SelectItem = { kind: "aggregate", fn, arg };
      if (alias !== undefined) item.alias = alias;
      if (distinct) item.distinct = true;
      return item;
    }
    // plain column
    const name = this.expect("ident", "a column name").value;
    const alias = this.parseAlias();
    const item: SelectItem = { kind: "column", name };
    if (alias !== undefined) item.alias = alias;
    return item;
  }

  private isAggregateName(name: string): boolean {
    const l = name.toLowerCase();
    return l === "count" || l === "sum" || l === "avg" || l === "min" || l === "max";
  }

  private parseAlias(): string | undefined {
    if (this.eatKeyword("as")) return this.expect("ident", "an alias").value;
    // implicit alias: a bare identifier that isn't a following clause keyword
    if (this.peek().type === "ident") return this.next().value;
    return undefined;
  }

  private parseFrom(): { kind: "path" | "name"; value: string } {
    const t = this.peek();
    if (t.type === "string") { this.next(); return { kind: "path", value: t.value }; }
    if (t.type === "ident") {
      this.next();
      const looksLikePath = /[./\\]/.test(t.value);
      return { kind: looksLikePath ? "path" : "name", value: t.value };
    }
    throw new SqlError(`Expected a file path or table name after FROM but found '${t.value || t.type}'`, t.pos);
  }

  // ---- WHERE / HAVING expression grammar ----
  private parseExpr(): Expr {
    return this.parseOr();
  }
  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.eatKeyword("or")) {
      const right = this.parseAnd();
      left = { type: "or", left, right };
    }
    return left;
  }
  private parseAnd(): Expr {
    let left = this.parseNot();
    while (this.eatKeyword("and")) {
      const right = this.parseNot();
      left = { type: "and", left, right };
    }
    return left;
  }
  private parseNot(): Expr {
    if (this.eatKeyword("not")) return { type: "not", expr: this.parseNot() };
    return this.parsePrimary();
  }
  private parsePrimary(): Expr {
    if (this.peek().type === "lparen") {
      this.next();
      const e = this.parseExpr();
      this.expect("rparen", "')'");
      return e;
    }
    return this.parsePredicate();
  }

  private parsePredicate(): Expr {
    const left = this.parseOperand();

    // IS [NOT] NULL
    if (this.eatKeyword("is")) {
      const negate = this.eatKeyword("not");
      this.expectKeyword("null");
      return { type: "isnull", left, negate };
    }

    // [NOT] LIKE / IN
    let negate = false;
    if (this.eatKeyword("not")) {
      negate = true;
      if (this.isKeyword("like")) { this.next(); return { type: "like", left, pattern: this.expectStringLiteral(), negate }; }
      if (this.isKeyword("in")) { this.next(); return { type: "in", left, values: this.parseInList(), negate }; }
      const t = this.peek();
      throw new SqlError(`Expected LIKE or IN after NOT but found '${t.value || t.type}'`, t.pos);
    }
    if (this.eatKeyword("like")) return { type: "like", left, pattern: this.expectStringLiteral(), negate };
    if (this.eatKeyword("in")) return { type: "in", left, values: this.parseInList(), negate };

    // comparison
    const t = this.peek();
    if (t.type === "op") {
      this.next();
      const right = this.parseOperand();
      return { type: "compare", op: t.value as "=" | "!=" | "<" | "<=" | ">" | ">=", left, right };
    }
    throw new SqlError(`Expected a comparison operator, LIKE, IN or IS NULL but found '${t.value || t.type}'`, t.pos);
  }

  private expectStringLiteral(): string {
    const t = this.peek();
    if (t.type !== "string") throw new SqlError(`LIKE expects a string pattern but found '${t.value || t.type}'`, t.pos);
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

  private parseOperand(): Operand {
    const t = this.peek();
    if (t.type === "ident") { this.next(); return { kind: "column", name: t.value }; }
    if (t.type === "string" || t.type === "number" || (t.type === "keyword" && t.value === "null")) {
      return { kind: "literal", value: this.parseLiteralValue() };
    }
    throw new SqlError(`Expected a column or value but found '${t.value || t.type}'`, t.pos);
  }

  private parseLiteralValue(): string | number | null {
    const t = this.peek();
    if (t.type === "string") { this.next(); return t.value; }
    if (t.type === "number") { this.next(); return t.num!; }
    if (t.type === "keyword" && t.value === "null") { this.next(); return null; }
    throw new SqlError(`Expected a literal value but found '${t.value || t.type}'`, t.pos);
  }

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
      stmt.orderBy.push({ column, dir });
    } while (this.eatComma());
  }

  private parseLimitOffset(stmt: SelectStatement): void {
    // Support both "LIMIT n OFFSET m" and a bare "OFFSET m".
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

/** Parse a SQL string into a typed {@link SelectStatement} AST. Throws {@link SqlError}. */
export function parseSql(sql: string): SelectStatement {
  if (!sql || !sql.trim()) throw new SqlError("Empty query");
  return new Parser(sql).parse();
}
