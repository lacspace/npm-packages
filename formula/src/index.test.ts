import { test, expect, describe } from "vitest";
import { readFileSync } from "node:fs";
import {
  compile, run, check, references, computeColumn, tableScope, registerFunction, describeFunction, matches,
  FUNCTIONS, FUNCTION_NAMES, FUNCTION_DOCS, AGGREGATES, FormulaError, toNumber, toText, toBoolean, type Scope,
} from "./index";

/**
 * The formula language is the one place user input becomes executable, so it is
 * tested hardest — both that it computes correctly and that it cannot reach
 * anything it should not.
 */

const row: Record<string, unknown> = { price: 250, purchasePrice: 100, stock: 12, name: "Black Tea", category: "Foods", d: "2026-03-15" };
const columns: Record<string, unknown[]> = {
  price: [250, 100, 60, 0],
  qty: [2, 1, 5, 10],
  stock: [12, 0, 5, 200],
  category: ["Foods", "Beverages", "Foods", "Dairy"],
  id: ["a", "b", "c", "d"],
  label: ["Apple", "Banana", "Cherry", "Date"],
};
const scope: Scope = { field: (n) => row[n], column: (n) => columns[n] ?? [] };
const val = (source: string) => run(source, scope);

describe("arithmetic", () => {
  test("does the basics", () => {
    expect(val("=1+2")).toBe(3); expect(val("=10-4")).toBe(6); expect(val("=6*7")).toBe(42);
    expect(val("=10/4")).toBe(2.5); expect(val("=2^10")).toBe(1024);
  });
  test("respects precedence and parentheses", () => { expect(val("=2+3*4")).toBe(14); expect(val("=(2+3)*4")).toBe(20); });
  test("handles unary minus and percent", () => { expect(val("=-5+2")).toBe(-3); expect(val("=-(3*2)")).toBe(-6); expect(val("=50%")).toBe(0.5); expect(val("=price*10%")).toBe(25); });
  test("returns null rather than Infinity when dividing by zero", () => { expect(val("=1/0")).toBeNull(); });
  test("works with or without a leading =", () => { expect(val("1+1")).toBe(2); expect(val("=1+1")).toBe(2); });
  test("parses scientific notation and leading-dot decimals", () => { expect(val("=1e3+.5")).toBe(1000.5); });
});

describe("references", () => {
  test("reads the current row", () => { expect(val("=price")).toBe(250); expect(val("=price-purchasePrice")).toBe(150); });
  test("computes a margin the way the schema does", () => { expect(val("=(price-purchasePrice)/price*100")).toBe(60); });
  test("reads a bracketed name so labels can contain spaces", () => {
    const s: Scope = { field: (n) => (n === "Sale Price" ? 42 : null), column: () => [] };
    expect(run("=[Sale Price]", s)).toBe(42);
  });
  test("knows TRUE and FALSE", () => { expect(val("=TRUE")).toBe(true); expect(val("=IF(FALSE,1,2)")).toBe(2); });
  test("references() lists the columns a formula reads", () => {
    expect(references("=IF(price=0,0,(price-purchasePrice)/price)")).toEqual(["price", "purchasePrice"]);
    expect(compile("=SUM(qty)+1").references).toEqual(["qty"]);
  });
});

describe("aggregates read whole columns", () => {
  test("sums a column, not just this row", () => { expect(val("=SUM(price)")).toBe(410); expect(val("=price*2")).toBe(500); });
  test("averages, counts and finds extremes", () => {
    expect(val("=AVERAGE(price)")).toBe(102.5); expect(val("=COUNT(price)")).toBe(4); expect(val("=MIN(price)")).toBe(0);
    expect(val("=MAX(price)")).toBe(250); expect(val("=MEDIAN(price)")).toBe(80); expect(val("=COUNTA(category)")).toBe(4);
  });
  test("sums and counts conditionally", () => {
    expect(val('=COUNTIF(category,"Foods")')).toBe(2); expect(val('=SUMIF(stock,">10")')).toBe(212); expect(val('=SUMIF(category,"Foods",price)')).toBe(310);
    expect(val('=AVERAGEIF(category,"Foods",price)')).toBe(155);
  });
  test("multi-criteria: SUMIFS / COUNTIFS / AVERAGEIFS / MAXIFS / MINIFS", () => {
    expect(val('=SUMIFS(price,category,"Foods",stock,">10")')).toBe(250);
    expect(val('=COUNTIFS(category,"Foods",stock,">0")')).toBe(2);
    expect(val('=AVERAGEIFS(price,category,"Foods")')).toBe(155);
    expect(val('=MAXIFS(price,category,"Foods")')).toBe(250);
    expect(val('=MINIFS(price,stock,">0")')).toBe(0);
  });
  test("wildcards in criteria", () => { expect(val('=COUNTIF(category,"F*")')).toBe(2); expect(val('=COUNTIF(category,"?airy")')).toBe(1); });
  test("still sums a literal list", () => { expect(val("=SUM(1,2,3)")).toBe(6); });
  test("order statistics and products", () => {
    expect(val("=LARGE(price,2)")).toBe(100); expect(val("=SMALL(price,1)")).toBe(0);
    expect(val("=RANK(price,price)")).toBe(1); expect(val("=RANK(100,price,TRUE)")).toBe(3);
    expect(val("=SUMPRODUCT(price,qty)")).toBe(900); expect(val("=PRODUCT(qty)")).toBe(100);
    expect(val("=STDEV(qty)")).toBeCloseTo(4.0415, 3); expect(val("=VAR(qty)")).toBeCloseTo(16.3333, 3);
  });
  test("AGGREGATES names the column-reading functions", () => { expect(AGGREGATES.has("SUM")).toBe(true); expect(AGGREGATES.has("UPPER")).toBe(false); });
});

describe("lookups", () => {
  test("LOOKUP / XLOOKUP find a matching row in another column", () => {
    expect(val('=LOOKUP("c",id,label)')).toBe("Cherry");
    expect(val('=XLOOKUP("zzz",id,label,"none")')).toBe("none");
    expect(val('=LOOKUP("zzz",id,label)')).toBeNull();
  });
  test("MATCH and INDEX", () => { expect(val('=MATCH("Foods",category)')).toBe(1); expect(val('=MATCH("x",category)')).toBeNull(); expect(val("=INDEX(price,2)")).toBe(100); });
});

describe("logic", () => {
  test("branches", () => { expect(val('=IF(stock>10,"ok","low")')).toBe("ok"); expect(val('=IF(stock>100,"ok","low")')).toBe("low"); });
  test("IFS / SWITCH / CHOOSE", () => {
    expect(val('=IFS(stock=0,"out",stock<100,"low",TRUE,"ok")')).toBe("low");
    expect(val('=SWITCH(category,"Foods",1,"Dairy",2,0)')).toBe(1);
    expect(val('=SWITCH("x","a",1,"b",2)')).toBeNull();
    expect(val('=CHOOSE(2,"a","b","c")')).toBe("b");
  });
  test("combines conditions", () => {
    expect(val("=AND(stock>1,price>1)")).toBe(true); expect(val("=OR(stock>1000,price>1)")).toBe(true);
    expect(val("=NOT(stock>1000)")).toBe(true); expect(val("=XOR(TRUE,TRUE)")).toBe(false);
  });
  test("IFERROR and info functions", () => {
    expect(val("=IFERROR(1/0,0)")).toBe(0); expect(val("=ISBLANK(missing)")).toBe(true); expect(val("=ISNUMBER(price)")).toBe(true);
    expect(val("=ISTEXT(name)")).toBe(true); expect(val("=ISEVEN(stock)")).toBe(true); expect(val("=ISODD(stock)")).toBe(false);
  });
  test("comparisons are numeric when both sides are numbers, text otherwise", () => {
    expect(val('="10">"9"')).toBe(true); expect(val('="apple"<"banana"')).toBe(true); expect(val('=name="black tea"')).toBe(true); expect(val("=price<>250")).toBe(false);
  });
});

describe("text", () => {
  test("joins text with & and CONCAT", () => { expect(val('=name&" x"&stock')).toBe("Black Tea x12"); expect(val('=CONCAT(name," ",stock)')).toBe("Black Tea 12"); });
  test("slices and reshapes text", () => {
    expect(val("=UPPER(name)")).toBe("BLACK TEA"); expect(val("=LEN(name)")).toBe(9); expect(val("=LEFT(name,5)")).toBe("Black");
    expect(val("=RIGHT(name,3)")).toBe("Tea"); expect(val("=MID(name,7,3)")).toBe("Tea"); expect(val('=SUBSTITUTE(name,"Black","Green")')).toBe("Green Tea");
    expect(val('=SUBSTITUTE("a-a-a","a","b",2)')).toBe("a-b-a"); expect(val('=REPLACE("abcdef",2,3,"X")')).toBe("aXef");
  });
  test("PROPER / TRIM / REPT / TEXTJOIN / EXACT / CHAR / CODE", () => {
    expect(val('=PROPER("black tea")')).toBe("Black Tea"); expect(val('=TRIM("  a   b ")')).toBe("a b"); expect(val('=REPT("-",3)')).toBe("---");
    expect(val('=TEXTJOIN(", ",TRUE,"a","","b")')).toBe("a, b"); expect(val('=TEXTJOIN("-",FALSE,"a","","b")')).toBe("a--b");
    expect(val('=EXACT("a","A")')).toBe(false); expect(val("=CHAR(65)")).toBe("A"); expect(val('=CODE("A")')).toBe(65);
  });
  test("FIND is case-sensitive, SEARCH is not", () => { expect(val('=FIND("Tea",name)')).toBe(7); expect(val('=FIND("tea",name)')).toBeNull(); expect(val('=SEARCH("tea",name)')).toBe(7); });
  test("STARTSWITH / ENDSWITH / CONTAINS", () => { expect(val('=STARTSWITH(name,"black")')).toBe(true); expect(val('=ENDSWITH(name,"Tea")')).toBe(true); expect(val('=CONTAINS(name,"ack t")')).toBe(true); });
  test("VALUE / NUMBERVALUE", () => { expect(val('=VALUE("1,200")')).toBe(1200); expect(val('=NUMBERVALUE("1.234,5",",",".")')).toBe(1234.5); });
  test("TEXT formats numbers and dates", () => {
    expect(val('=TEXT(1234.5,"#,##0.00")')).toBe("1,234.50"); expect(val('=TEXT(0.256,"0.0%")')).toBe("25.6%"); expect(val('=TEXT(3,"0")')).toBe("3");
    expect(val('=TEXT("2026-03-05","dd/mm/yyyy")')).toBe("05/03/2026"); expect(val('=TEXT("2026-03-05","mmm yyyy")')).toBe("Mar 2026");
  });
  test("a doubled quote escapes a quote inside text", () => { expect(val('="say ""hi"""')).toBe('say "hi"'); });
  test("rounds", () => {
    expect(val("=ROUND(2.567,2)")).toBe(2.57); expect(val("=ROUND(2.5)")).toBe(3); expect(val("=ROUND(-2.5)")).toBe(-3); expect(val("=ROUND(1.005,2)")).toBe(1.01);
    expect(val("=ROUNDUP(2.11,1)")).toBe(2.2); expect(val("=ROUNDDOWN(2.99,1)")).toBe(2.9); expect(val("=INT(-2.5)")).toBe(-3); expect(val("=TRUNC(-2.5)")).toBe(-2);
    expect(val("=FLOOR(2.9)")).toBe(2); expect(val("=CEILING(2.1)")).toBe(3); expect(val("=ABS(0-7)")).toBe(7); expect(val("=MOD(-1,3)")).toBe(2);
    expect(val("=EVEN(3)")).toBe(4); expect(val("=ODD(2)")).toBe(3); expect(val("=SIGN(-12)")).toBe(-1); expect(val("=LOG(8,2)")).toBe(3); expect(val("=SQRT(81)")).toBe(9);
  });
});

describe("dates", () => {
  test("returns today as an ISO date", () => { expect(String(val("=TODAY()"))).toMatch(/^\d{4}-\d{2}-\d{2}$/); });
  test("pulls parts out of a date", () => { expect(val("=YEAR(d)")).toBe(2026); expect(val("=MONTH(d)")).toBe(3); expect(val("=DAY(d)")).toBe(15); });
  test("counts days between two dates", () => { expect(val('=DAYS("2026-03-10","2026-03-01")')).toBe(9); });
  test("DATE / DATEVALUE / EDATE / EOMONTH", () => {
    expect(val("=DATE(2026,9,10)")).toBe("2026-09-10"); expect(val('=DATEVALUE("2026-09-10T10:00:00Z")')).toBe("2026-09-10");
    expect(val('=EDATE("2026-01-31",1)')).toBe("2026-02-28"); expect(val('=EOMONTH("2026-02-10",0)')).toBe("2026-02-28"); expect(val('=EOMONTH("2026-01-15",1)')).toBe("2026-02-28");
  });
  test("WEEKDAY / DATEDIF / NETWORKDAYS", () => {
    expect(val('=WEEKDAY("2026-09-10",2)')).toBe(4); // Thursday
    expect(val('=WEEKDAY("2026-09-13")')).toBe(1); // Sunday, type 1
    expect(val('=DATEDIF("2024-01-15","2026-09-10","Y")')).toBe(2); expect(val('=DATEDIF("2026-01-31","2026-03-01","M")')).toBe(1); expect(val('=DATEDIF("2026-03-01","2026-03-10","D")')).toBe(9);
    expect(val('=NETWORKDAYS("2026-09-07","2026-09-11")')).toBe(5); expect(val('=NETWORKDAYS("2026-09-05","2026-09-06")')).toBe(0);
  });
});

describe("tables", () => {
  const rows = [
    { item: "Shirt", qty: 2, rate: 850 },
    { item: "Jacket", qty: 1, rate: 2400 },
    { item: "Scarf", qty: 5, rate: 450 },
  ];
  test("computeColumn evaluates a formula down a table", () => {
    expect(computeColumn("=qty*rate", rows)).toEqual([1700, 2400, 2250]);
    expect(computeColumn("=qty*rate/SUM(qty*rate)", rows)).toEqual([1, 1, 1]); // an EXPRESSION inside SUM is row-scoped; only a bare column name reads the column
    expect(computeColumn("=rate/SUM(rate)*100", rows).map((v) => Math.round(v as number))).toEqual([23, 65, 12]);
  });
  test("tableScope caches column reads", () => {
    const cache = new Map<string, unknown[]>();
    const s = tableScope(rows, 1, cache);
    expect(s.field("item")).toBe("Jacket"); expect(s.column("qty")).toEqual([2, 1, 5]); expect(cache.has("qty")).toBe(true);
  });
});

describe("api", () => {
  test("check() reports syntax problems with a position", () => {
    expect(check("=1+2")).toEqual({ ok: true });
    const bad = check("=1+2 3"); expect(bad.ok).toBe(false); if (!bad.ok) { expect(bad.error).toMatch(/Unexpected/); expect(bad.position).toBe(4); }
    expect(check("=NOPE(1)").ok).toBe(true); // unknown functions are a runtime error, not a syntax error
  });
  test("registerFunction adds a documented function, optionally column-scoped", () => {
    registerFunction("DOUBLE", ([v]) => toNumber(v) * 2, { category: "math", signature: "DOUBLE(n)", description: "Twice n.", example: "=DOUBLE(2)", result: "4" });
    expect(val("=double(price)")).toBe(500);
    expect(describeFunction("double")?.signature).toBe("DOUBLE(n)");
    expect(FUNCTION_NAMES).toContain("DOUBLE");
    registerFunction("FIRST", ([col]) => (Array.isArray(col) ? col[0] : col), { category: "lookup", signature: "FIRST(column)", description: "First value.", example: "=FIRST(price)", columnArgs: [0] });
    expect(val("=FIRST(price)")).toBe(250);
    expect(AGGREGATES.has("FIRST")).toBe(true);
  });
  test("coercion helpers", () => {
    expect(toNumber("Rs 1,200")).toBe(1200); expect(toNumber(true)).toBe(1); expect(toNumber(null)).toBe(0);
    expect(toText(new Date(Date.UTC(2026, 0, 2)))).toBe("2026-01-02"); expect(toText(true)).toBe("TRUE");
    expect(toBoolean("no")).toBe(false); expect(toBoolean("yes")).toBe(true); expect(toBoolean(0)).toBe(false);
    expect(matches(15, ">10")).toBe(true); expect(matches("Foods", "foods")).toBe(true);
  });
});

describe("errors", () => {
  const empty: Scope = { field: () => null, column: () => [] };
  test("rejects an unknown function", () => { expect(() => compile("=NOPE(1)")(empty)).toThrow(FormulaError); });
  test("rejects unbalanced parentheses", () => { expect(() => compile("=(1+2")).toThrow(FormulaError); });
  test("rejects trailing junk", () => { expect(() => compile("=1+2 3")).toThrow(FormulaError); });
  test("rejects an unclosed string and an empty formula", () => { expect(() => compile('="abc')).toThrow(FormulaError); expect(() => compile("=")).toThrow(FormulaError); });
  test("run() swallows the error and yields null", () => { expect(val("=NOPE(")).toBeNull(); });
});

describe("safety", () => {
  test("cannot reach globals or prototypes", () => {
    const seen: string[] = [];
    const s: Scope = { field: (n) => { seen.push(n); return undefined; }, column: () => [] };
    run("=constructor", s); run("=__proto__", s); run("=window", s);
    expect(seen).toEqual(["constructor", "__proto__", "window"]);
  });
  test("exposes only whitelisted functions", () => {
    expect(FUNCTIONS).not.toHaveProperty("eval"); expect(FUNCTIONS).not.toHaveProperty("Function");
    expect(FUNCTION_NAMES.length).toBeGreaterThanOrEqual(100);
  });
  test("treats a function-shaped reference as an unknown function, not a call", () => {
    expect(() => compile("=alert(1)")({ field: () => null, column: () => [] })).toThrow(/Unknown function/);
  });
  test("the engine source never uses eval or new Function", () => {
    const src = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/\beval\s*\(/);
    expect(src).not.toMatch(/new\s+Function\b/);
  });
  test("every built-in function is documented, and every doc names a real function", () => {
    const documented = new Set(FUNCTION_DOCS.map((d) => d.name));
    const missing = Object.keys(FUNCTIONS).filter((n) => !documented.has(n) && n !== "DOUBLE" && n !== "FIRST");
    expect(missing).toEqual([]);
    const phantom = FUNCTION_DOCS.filter((d) => !(d.name in FUNCTIONS)).map((d) => d.name);
    expect(phantom).toEqual([]);
  });
});
