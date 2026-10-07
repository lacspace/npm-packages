import { describe, expect, it } from "vitest";
import { checkPattern, compileSafe, evaluate, explain, getPath, testCapped, validateConditions } from "./index";
import type { Condition } from "./index";

const msg = {
  from: { name: "Anita K", address: "anita@acme.com" },
  to: [{ name: "Me", address: "me@lacspace.com" }, { address: "Sales@Lacspace.com" }],
  subject: "Invoice #42 for September",
  hasAttachments: true,
  isList: false,
  size: 2048,
  labels: ["client", "q3"],
  date: new Date("2026-09-20T10:00:00Z"),
  sentAt: "2026-09-20T10:00:00Z",
  risk: { level: "none" },
  score: "7",
};
const ev = (c: Condition | Condition[], opts = {}) => evaluate(Array.isArray(c) ? c : [c], msg, opts);

describe("getPath", () => {
  it("reads dotted paths", () => expect(getPath(msg, "from.address")).toBe("anita@acme.com"));
  it("fans out over arrays", () => expect(getPath(msg, "to.address")).toEqual(["me@lacspace.com", "Sales@Lacspace.com"]));
  it("indexes arrays with numbers", () => expect(getPath(msg, "to.1.address")).toBe("Sales@Lacspace.com"));
  it("missing gives undefined", () => expect(getPath(msg, "from.phone")).toBeUndefined());
  it("blocks prototype keys and inherited properties", () => {
    expect(getPath(msg, "__proto__")).toBeUndefined();
    expect(getPath(msg, "from.constructor")).toBeUndefined();
    expect(getPath(msg, "subject.length")).toBeUndefined();
    expect(getPath({}, "toString")).toBeUndefined();
  });
});

describe("string ops", () => {
  it("equals is case-insensitive and trims the value", () => expect(ev({ field: "risk.level", op: "equals", value: " NONE " })).toBe(true));
  it("equals honours caseSensitive", () => expect(ev({ field: "risk.level", op: "equals", value: "NONE" }, { caseSensitive: true })).toBe(false));
  it("notEquals", () => expect(ev({ field: "risk.level", op: "notEquals", value: "high" })).toBe(true));
  it("contains", () => expect(ev({ field: "subject", op: "contains", value: "invoice" })).toBe(true));
  it("notContains", () => expect(ev({ field: "subject", op: "notContains", value: "receipt" })).toBe(true));
  it("startsWith / endsWith", () => {
    expect(ev({ field: "subject", op: "startsWith", value: "invoice" })).toBe(true);
    expect(ev({ field: "from.address", op: "endsWith", value: "@acme.com" })).toBe(true);
    expect(ev({ field: "from.address", op: "endsWith", value: "@other.com" })).toBe(false);
  });
  it("array fields: any element matches", () => {
    expect(ev({ field: "to.address", op: "equals", value: "sales@lacspace.com" })).toBe(true);
    expect(ev({ field: "labels", op: "contains", value: "q3" })).toBe(true);
  });
  it("negative ops on arrays mean no element matches", () => {
    expect(ev({ field: "labels", op: "notContains", value: "q3" })).toBe(false);
    expect(ev({ field: "labels", op: "notContains", value: "spam" })).toBe(true);
  });
  it("missing field: positive fails, negative passes", () => {
    expect(ev({ field: "cc.address", op: "contains", value: "x" })).toBe(false);
    expect(ev({ field: "cc.address", op: "notContains", value: "x" })).toBe(true);
  });
});

describe("is / booleans", () => {
  it("is with no value means true (as in the source)", () => expect(ev({ field: "hasAttachments", op: "is" })).toBe(true));
  it("is with words", () => {
    expect(ev({ field: "isList", op: "is", value: "no" })).toBe(true);
    expect(ev({ field: "isList", op: "is", value: "true" })).toBe(false);
  });
  it("isNot", () => expect(ev({ field: "isList", op: "isNot", value: true })).toBe(true));
  it("equals false on a true boolean fails (source returned the raw boolean)", () => expect(ev({ field: "hasAttachments", op: "equals", value: false })).toBe(false));
  it("unknown boolean words never match", () => expect(ev({ field: "hasAttachments", op: "is", value: "maybe" })).toBe(false));
});

describe("numbers and dates", () => {
  it("gt / gte / lt / lte with numbers and numeric strings", () => {
    expect(ev({ field: "size", op: "gt", value: 1024 })).toBe(true);
    expect(ev({ field: "size", op: "gte", value: "2048" })).toBe(true);
    expect(ev({ field: "size", op: "lt", value: 2048 })).toBe(false);
    expect(ev({ field: "score", op: "lte", value: 7 })).toBe(true);
  });
  it("equals compares numbers numerically", () => expect(ev({ field: "size", op: "equals", value: "2048.0" })).toBe(true));
  it("non-numeric comparisons fail", () => expect(ev({ field: "subject", op: "gt", value: 1 })).toBe(false));
  it("dates compare with Date and ISO strings", () => {
    expect(ev({ field: "date", op: "gt", value: "2026-09-01" })).toBe(true);
    expect(ev({ field: "sentAt", op: "lt", value: new Date("2026-10-01") })).toBe(true);
    expect(ev({ field: "sentAt", op: "gte", value: "2026-09-21" })).toBe(false);
  });
  it("between (inclusive) with arrays and {min,max}", () => {
    expect(ev({ field: "size", op: "between", value: [1000, 2048] })).toBe(true);
    expect(ev({ field: "size", op: "between", value: { min: 3000, max: 4000 } })).toBe(false);
    expect(ev({ field: "date", op: "between", value: ["2026-09-01", "2026-09-30"] })).toBe(true);
  });
  it("between with a bad value fails", () => expect(ev({ field: "size", op: "between", value: 5 })).toBe(false));
});

describe("in / exists", () => {
  it("in with an array", () => expect(ev({ field: "risk.level", op: "in", value: ["low", "none"] })).toBe(true));
  it("in with a comma string", () => expect(ev({ field: "labels", op: "in", value: "vip, client" })).toBe(true));
  it("notIn", () => expect(ev({ field: "risk.level", op: "notIn", value: ["high", "medium"] })).toBe(true));
  it("in with numbers", () => expect(ev({ field: "size", op: "in", value: [1024, 2048] })).toBe(true));
  it("exists / notExists", () => {
    expect(ev({ field: "from.name", op: "exists" })).toBe(true);
    expect(ev({ field: "cc", op: "exists" })).toBe(false);
    expect(ev({ field: "cc", op: "notExists" })).toBe(true);
    expect(evaluate([{ field: "tags", op: "exists" }], { tags: [] })).toBe(false);
    expect(evaluate([{ field: "n", op: "exists" }], { n: null })).toBe(false);
  });
  it("equals null matches a missing field", () => expect(ev({ field: "cc", op: "equals", value: null })).toBe(true));
});

describe("regex", () => {
  it("matches case-insensitively by default", () => expect(ev({ field: "subject", op: "regex", value: "invoice #\\d+" })).toBe(true));
  it("supports /pattern/flags and RegExp values", () => {
    expect(ev({ field: "subject", op: "regex", value: "/^INVOICE/" }, { caseSensitive: true })).toBe(false);
    expect(ev({ field: "subject", op: "regex", value: "/^INVOICE/i" }, { caseSensitive: true })).toBe(true);
    expect(ev({ field: "subject", op: "regex", value: /september$/ })).toBe(true);
  });
  it("drops the g flag so repeated tests are stable", () => {
    const c: Condition = { field: "subject", op: "regex", value: "/invoice/g" };
    expect(ev(c)).toBe(true);
    expect(ev(c)).toBe(true);
  });
  it("rejects nested quantifiers", () => {
    expect(checkPattern("(a+)+")).toMatch(/nested/);
    expect(checkPattern("(a*)*b")).toMatch(/nested/);
    expect(checkPattern("((ab)+){2,}")).toMatch(/nested/);
    expect(checkPattern("(?:x+y)*")).toMatch(/nested/);
    expect(checkPattern("((a+)?)+")).toMatch(/nested/);
    expect(ev({ field: "subject", op: "regex", value: "(a+)+$" })).toBe(false);
  });
  it("allows safe groups and quantifier chars inside classes", () => {
    expect(checkPattern("(ab)+")).toBeNull();
    expect(checkPattern("(a+)?b")).toBeNull();
    expect(checkPattern("([+*]x)+")).toBeNull();
    expect(checkPattern("(?<year>\\d{4})-\\d{2}")).toBeNull();
    expect(checkPattern("\\(a+\\)+")).toBeNull();
  });
  it("rejects backreferences", () => {
    expect(checkPattern("(a)\\1")).toMatch(/backreference/);
    expect(checkPattern("(?<x>a)\\k<x>")).toMatch(/backreference/);
  });
  it("rejects long patterns", () => {
    expect(checkPattern("a".repeat(257))).toMatch(/longer/);
    expect(compileSafe("a".repeat(20), false, { maxPatternLength: 10 })).toMatch(/longer/);
  });
  it("invalid regex fails without throwing", () => {
    expect(typeof compileSafe("(unclosed")).toBe("string");
    expect(ev({ field: "subject", op: "regex", value: "(unclosed" })).toBe(false);
  });
  it("caps the input length tested", () => {
    const long = "x".repeat(50) + "needle";
    expect(testCapped(/needle/, long, 40)).toBe(false);
    expect(evaluate([{ field: "s", op: "regex", value: "needle" }], { s: long }, { regex: { maxInputLength: 40 } })).toBe(false);
    expect(evaluate([{ field: "s", op: "regex", value: "needle" }], { s: long })).toBe(true);
  });
});

describe("match all / any and explain", () => {
  const conds: Condition[] = [
    { field: "from.address", op: "endsWith", value: "@acme.com" },
    { field: "subject", op: "contains", value: "receipt" },
  ];
  it("all (default)", () => expect(ev(conds)).toBe(false));
  it("any", () => expect(ev(conds, { match: "any" })).toBe(true));
  it("empty conditions never match by default (as in the source)", () => {
    expect(evaluate([], msg)).toBe(false);
    expect(evaluate([], msg, { emptyResult: true })).toBe(true);
  });
  it("explain gives per-condition pass/fail with the actual value", () => {
    const e = explain(conds, msg);
    expect(e.result).toBe(false);
    expect(e.match).toBe("all");
    expect(e.conditions.map((c) => c.passed)).toEqual([true, false]);
    expect(e.conditions[0]!.actual).toBe("anita@acme.com");
  });
  it("explain reports errors", () => {
    const e = explain([{ field: "subject", op: "regex", value: "(a+)+" }, { field: "x", op: "nope" as "is" }], msg);
    expect(e.conditions[0]!.error).toMatch(/nested/);
    expect(e.conditions[1]!.error).toMatch(/unknown op/);
  });
  it("custom getField maps app fields (like the mail app's from = name + address)", () => {
    const getField = (m: typeof msg, f: string) => (f === "from" ? `${m.from.name} ${m.from.address}` : getPath(m, f));
    expect(evaluate([{ field: "from", op: "contains", value: "anita k" }], msg, { getField })).toBe(true);
  });
  it("never throws on junk", () => {
    expect(evaluate(null as unknown as Condition[], msg)).toBe(false);
    expect(evaluate([null as unknown as Condition], msg)).toBe(false);
    expect(evaluate([{ field: "a", op: "equals", value: 1 }], null)).toBe(false);
    expect(evaluate([{ field: "a", op: "equals", value: 1 }], {}, { getField: () => { throw new Error("x"); } })).toBe(false);
    expect(evaluate([{ field: "__proto__", op: "exists" }], {})).toBe(false);
  });
});

describe("validateConditions", () => {
  it("accepts valid conditions", () => {
    expect(validateConditions([
      { field: "subject", op: "contains", value: "x" },
      { field: "hasAttachments", op: "is" },
      { field: "size", op: "between", value: [1, 10] },
      { field: "risk.level", op: "in", value: ["high"] },
      { field: "cc", op: "notExists" },
      { field: "subject", op: "regex", value: "^re:" },
      { field: "date", op: "gt", value: "2026-01-01" },
    ])).toEqual([]);
  });
  it("reports bad input", () => {
    expect(validateConditions("nope")[0]!.index).toBe(-1);
    const errs = validateConditions([
      null,
      { field: "", op: "equals", value: 1 },
      { field: "a", op: "bogus" },
      { field: "a", op: "contains" },
      { field: "a", op: "contains", value: "  " },
      { field: "a", op: "gt", value: "abc" },
      { field: "a", op: "between", value: [5, 1] },
      { field: "a", op: "in", value: [] },
      { field: "a", op: "regex", value: "(a+)+" },
      { field: "a.__proto__.b", op: "exists" },
    ]);
    expect(errs.map((e) => e.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
  it("limits the number of conditions", () => {
    const many = Array.from({ length: 3 }, () => ({ field: "a", op: "exists" }));
    expect(validateConditions(many, { maxConditions: 2 })[0]!.message).toMatch(/too many/);
  });
});

describe("README example", () => {
  it("behaves as documented", () => {
    const message = {
      from: { name: "Anita K", address: "anita@acme.com" },
      to: [{ address: "me@lacspace.com" }, { address: "sales@lacspace.com" }],
      subject: "Invoice #42 for September",
      size: 2048,
      labels: ["client"],
    };
    const conditions = [
      { field: "from.address", op: "endsWith", value: "@acme.com" },
      { field: "to.address", op: "equals", value: "sales@lacspace.com" },
      { field: "subject", op: "regex", value: "invoice #\\d+" },
    ] as const;
    expect(validateConditions(conditions)).toEqual([]);
    expect(evaluate([...conditions], message)).toBe(true);
    expect(evaluate([...conditions], message, { match: "any" })).toBe(true);
    expect(explain([{ field: "size", op: "gt", value: 4096 }], message)).toEqual({
      result: false,
      match: "all",
      conditions: [{ index: 0, field: "size", op: "gt", value: 4096, passed: false, actual: 2048 }],
    });
  });
});
