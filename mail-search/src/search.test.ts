import { describe, expect, it } from "vitest";
import {
  SEARCH_HELP,
  clauseToString,
  defaultAccessor,
  matchesAst,
  parseDay,
  parseSearch,
  parseSize,
  toQueryString,
} from "./index";
import type { SearchAst, SearchClause } from "./index";

const NOW = Date.UTC(2026, 9, 7, 15, 30); // 2026-10-07T15:30Z
const p = (q: string) => parseSearch(q, { now: NOW });
const only = (q: string): SearchClause => {
  const a = p(q);
  expect(a.clauses).toHaveLength(1);
  return a.clauses[0]!;
};

describe("free text", () => {
  it("empty query gives an empty AST", () => expect(p("")).toEqual({ text: "", clauses: [], orGroups: [], errors: [] }));
  it("plain words become text clauses", () => {
    const a = p("invoice march");
    expect(a.text).toBe("invoice march");
    expect(a.clauses.map((c) => c.value)).toEqual(["invoice", "march"]);
    expect(a.clauses.every((c) => c.field === "text" && c.op === "contains")).toBe(true);
  });
  it("quoted phrases stay together", () => {
    const c = only('"quarterly report"');
    expect(c).toMatchObject({ field: "text", value: "quarterly report", phrase: true });
  });
  it("unclosed quote runs to the end", () => expect(only('"open ended').value).toBe("open ended"));
  it("negated word", () => {
    const a = p("invoice -draft");
    expect(a.clauses[1]).toMatchObject({ field: "text", value: "draft", negated: true });
    expect(a.text).toBe("invoice");
  });
  it("a lone dash is text", () => expect(only("-").value).toBe("-"));
  it("unknown operators fall back to text", () => expect(only("foo:bar")).toMatchObject({ field: "text", value: "foo:bar" }));
  it("URLs and times stay text", () => {
    expect(only("https://x.com").field).toBe("text");
    expect(only("10:30").field).toBe("text");
  });
});

describe("operators", () => {
  it("from:", () => expect(only("from:anita")).toMatchObject({ field: "from", op: "contains", value: "anita", negated: false, operator: "from" }));
  it("operator keys are case-insensitive", () => expect(only("FROM:anita").field).toBe("from"));
  it("to: and cc:", () => {
    expect(only("to:sales@").field).toBe("to");
    expect(only("cc:boss").field).toBe("cc");
  });
  it("subject: with a quoted value", () => expect(only('subject:"weekly sync"')).toMatchObject({ field: "subject", value: "weekly sync" }));
  it("has:attachment and synonyms", () => {
    expect(only("has:attachment")).toMatchObject({ field: "has", op: "has", value: "attachment" });
    expect(only("has:files").value).toBe("attachment");
  });
  it("unknown has: value is text", () => expect(only("has:drive").field).toBe("text"));
  it("is: canonical values", () => {
    expect(only("is:unread")).toMatchObject({ field: "is", op: "is", value: "unread" });
    expect(only("is:read").value).toBe("read");
    expect(only("is:flagged").value).toBe("starred");
    expect(only("is:starred").value).toBe("starred");
    expect(only("is:phishing").value).toBe("suspicious");
    expect(only("is:verified").value).toBe("verified");
    expect(only("is:bulk").value).toBe("list");
    expect(only("is:priority").value).toBe("important");
    expect(only("is:answered").value).toBe("replied");
  });
  it("unknown is: value is text", () => expect(only("is:snoozed").field).toBe("text"));
  it("in:", () => expect(only("in:Archive")).toMatchObject({ field: "in", op: "in", value: "Archive" }));
  it("label:", () => expect(only("label:client")).toMatchObject({ field: "label", op: "eq", value: "client" }));
  it("category: is lowercased", () => expect(only("category:Finance")).toMatchObject({ field: "category", op: "eq", value: "finance" }));
  it("filename:", () => expect(only("filename:pdf")).toMatchObject({ field: "filename", op: "contains", value: "pdf" }));
  it("negated operator", () => expect(only("-label:done")).toMatchObject({ field: "label", negated: true }));
  it("empty value is an error, not a match-all", () => {
    const a = p("from:");
    expect(a.clauses).toHaveLength(0);
    expect(a.errors[0]).toMatch(/from/);
  });
});

describe("dates and sizes", () => {
  it("after: YYYY-MM-DD is midnight UTC", () => {
    const c = only("after:2026-09-01");
    expect(c).toMatchObject({ field: "date", op: "after", raw: "2026-09-01" });
    expect((c.value as Date).toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
  it("before: YYYY/MM/DD", () => expect((only("before:2026/9/5").value as Date).toISOString()).toBe("2026-09-05T00:00:00.000Z"));
  it("since: and until: (until includes the day)", () => {
    expect(only("since:2026-01-01").op).toBe("after");
    const u = only("until:2026-01-01");
    expect(u.op).toBe("before");
    expect((u.value as Date).toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });
  it("invalid dates are errors and fall back to text", () => {
    const a = p("after:2026-02-31");
    expect(a.errors).toHaveLength(1);
    expect(a.clauses[0]).toMatchObject({ field: "text", value: "after:2026-02-31" });
  });
  it("today, yesterday and relative days use `now`", () => {
    expect((only("after:today").value as Date).toISOString()).toBe("2026-10-07T00:00:00.000Z");
    expect((only("after:yesterday").value as Date).toISOString()).toBe("2026-10-06T00:00:00.000Z");
    expect((only("after:7d").value as Date).toISOString()).toBe("2026-09-30T00:00:00.000Z");
  });
  it("newer_than: d/w/m/y counts back from now", () => {
    expect((only("newer_than:2d").value as Date).toISOString()).toBe("2026-10-05T15:30:00.000Z");
    expect((only("newer_than:1w").value as Date).toISOString()).toBe("2026-09-30T15:30:00.000Z");
    expect((only("newer_than:3m").value as Date).toISOString()).toBe("2026-07-07T15:30:00.000Z");
    expect(only("newer_than:1y")).toMatchObject({ op: "after", raw: "1y" });
  });
  it("older_than: is before", () => expect(only("older_than:1y").op).toBe("before"));
  it("bad period is an error", () => expect(p("older_than:soon").errors[0]).toMatch(/older_than/));
  it("larger:/smaller: in bytes (1K = 1024)", () => {
    expect(only("larger:5M")).toMatchObject({ field: "size", op: "gt", value: 5 * 1024 * 1024 });
    expect(only("smaller:500K")).toMatchObject({ op: "lt", value: 500 * 1024 });
  });
  it("larger:0 is valid (the source treated 0 as invalid)", () => expect(only("larger:0").value).toBe(0));
  it("parseDay and parseSize helpers", () => {
    expect(parseDay("2026-13-01")).toBeNull();
    expect(parseDay("nope")).toBeNull();
    expect(parseSize("1.5g")).toBe(Math.round(1.5 * 1024 ** 3));
    expect(parseSize("big")).toBeNull();
  });
});

describe("OR groups", () => {
  it("a OR b becomes one group", () => {
    const a = p("from:anita OR from:raj is:unread");
    expect(a.orGroups).toHaveLength(1);
    expect(a.orGroups[0]!.map((c) => c.value)).toEqual(["anita", "raj"]);
    expect(a.clauses).toHaveLength(1);
    expect(a.clauses[0]!.field).toBe("is");
  });
  it("chains of OR", () => expect(p("a OR b OR c").orGroups[0]).toHaveLength(3));
  it("lowercase or is a word", () => expect(p("a or b").clauses).toHaveLength(3));
  it("dangling OR is an error and ignored", () => {
    expect(p("OR a").errors).toHaveLength(1);
    const t = p("a OR");
    expect(t.errors).toHaveLength(1);
    expect(t.clauses).toHaveLength(1);
  });
  it("text inside an OR group is not in `text`", () => expect(p("invoice OR receipt").text).toBe(""));
});

describe("toQueryString", () => {
  const roundTrip = (q: string) => {
    const a = p(q);
    const b = p(toQueryString(a));
    expect(b.clauses).toEqual(a.clauses);
    expect(b.orGroups).toEqual(a.orGroups);
  };
  it("round-trips a mixed query", () => roundTrip('invoice from:anita has:attachment is:unread after:2026-09-01 -label:done "q3 report"'));
  it("round-trips relative dates and sizes", () => roundTrip("newer_than:2w older_than:1y larger:5M smaller:10k until:2026-01-01"));
  it("round-trips OR groups and negation", () => roundTrip("from:a OR from:b -subject:\"out of office\" -spam"));
  it("quotes text that would otherwise parse as an operator", () => {
    const s = toQueryString({ clauses: [{ field: "text", op: "contains", value: "a:b", negated: false }] });
    expect(s).toBe('"a:b"');
  });
  it("builds a query from a hand-made AST", () => {
    const ast: Partial<SearchAst> = {
      clauses: [
        { field: "date", op: "after", value: new Date(Date.UTC(2026, 0, 2)), negated: false },
        { field: "size", op: "gt", value: 2048, negated: true },
        { field: "from", op: "contains", value: "Anita K", negated: false },
      ],
    };
    expect(toQueryString(ast)).toBe('after:2026-01-02 -larger:2048 from:"Anita K"');
  });
  it("ignores junk", () => {
    expect(toQueryString(null)).toBe("");
    expect(clauseToString(null as unknown as SearchClause)).toBe("");
  });
});

describe("matchesAst", () => {
  const msg = {
    from: { name: "Anita K", address: "anita@acme.com" },
    to: [{ address: "me@lacspace.com" }],
    subject: "Invoice for September",
    date: new Date(Date.UTC(2026, 8, 20)),
    size: 3 * 1024 * 1024,
    labels: ["client", "q3"],
    flags: ["seen"],
    attachments: [{ filename: "invoice-0920.pdf" }],
  };
  const acc = (m: typeof msg, field: string, c: SearchClause): unknown => {
    switch (field) {
      case "text": return [m.subject, m.from.name, m.from.address];
      case "label": return m.labels;
      case "filename": return m.attachments.map((a) => a.filename);
      case "has": return m.attachments.length > 0;
      case "is": return c.value === "unread" ? !m.flags.includes("seen") : c.value === "read" ? m.flags.includes("seen") : false;
      default: return (m as Record<string, unknown>)[field];
    }
  };
  const m = (q: string) => matchesAst(p(q), msg, acc);

  it("matches text and from:", () => expect(m("invoice from:anita")).toBe(true));
  it("contains searches object string values", () => expect(m("from:acme.com")).toBe(true));
  it("negation", () => {
    expect(m("-from:anita")).toBe(false);
    expect(m("-label:done")).toBe(true);
  });
  it("is:/has: via boolean accessor results", () => {
    expect(m("is:read has:attachment")).toBe(true);
    expect(m("is:unread")).toBe(false);
  });
  it("label: eq matches any array element", () => {
    expect(m("label:Q3")).toBe(true);
    expect(m("label:q")).toBe(false);
  });
  it("dates", () => {
    expect(m("after:2026-09-01 before:2026-10-01")).toBe(true);
    expect(m("after:2026-09-21")).toBe(false);
  });
  it("sizes", () => {
    expect(m("larger:2M")).toBe(true);
    expect(m("smaller:2M")).toBe(false);
  });
  it("OR groups", () => {
    expect(m("from:raj OR from:anita")).toBe(true);
    expect(m("from:raj OR from:sita")).toBe(false);
  });
  it("missing fields fail (and pass when negated)", () => {
    expect(m("cc:boss")).toBe(false);
    expect(m("-cc:boss")).toBe(true);
  });
  it("default accessor reads record[field] and searches all strings for text", () => {
    const rec = { subject: "Hello there", from: "bob@x.com", size: 10 };
    expect(matchesAst(p("hello subject:there larger:5"), rec)).toBe(true);
    expect(matchesAst(p("bob"), rec)).toBe(true);
    expect(defaultAccessor(rec, "__proto__")).toBeUndefined();
  });
  it("empty AST matches everything; a throwing accessor never throws", () => {
    expect(matchesAst(p(""), {})).toBe(true);
    expect(matchesAst(p("from:x"), {}, () => { throw new Error("x"); })).toBe(false);
  });
});

describe("robustness", () => {
  it("never throws on non-strings", () => {
    expect(parseSearch(undefined as unknown as string).clauses).toEqual([]);
    expect(parseSearch(5 as unknown as string).errors).toHaveLength(1);
  });
  it("SEARCH_HELP lists examples that all parse without errors", () => {
    for (const [ex] of SEARCH_HELP) expect(p(ex).errors).toEqual([]);
  });
});

describe("README example", () => {
  it("round-trips the documented query exactly", () => {
    const q = "invoice from:anita has:attachment is:unread after:2026-09-01 -label:done";
    const a = p(q);
    expect(a.text).toBe("invoice");
    expect(a.clauses).toHaveLength(6);
    expect(toQueryString(a)).toBe(q);
  });
});
