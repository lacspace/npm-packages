import { describe, it, expect } from "vitest";
import {
  hashValue, getByPath, toValueString, feedItemIds, inferType, watchId,
  snapshotValue, snapshotItems, diffSnapshots, retainHistory,
  parseNumeric, parseCondition, evalCondition, evalWhen,
  lineDiff, wordDiff, jsonDiff, sslDaysUntil,
} from "./core.js";

describe("hashValue", () => {
  it("is deterministic and differs on change", () => {
    expect(hashValue("abc")).toBe(hashValue("abc"));
    expect(hashValue("abc")).not.toBe(hashValue("abd"));
    expect(hashValue("")).toBe(hashValue(""));
  });
});

describe("getByPath", () => {
  const obj = { data: { price: 42, tags: ["a", "b"] }, items: [{ id: 1 }, { id: 2 }] };
  it("reads dot + bracket paths", () => {
    expect(getByPath(obj, "data.price")).toBe(42);
    expect(getByPath(obj, "data.tags.1")).toBe("b");
    expect(getByPath(obj, "items[1].id")).toBe(2);
    expect(getByPath(obj, "")).toBe(obj);
    expect(getByPath(obj, "nope.x")).toBeUndefined();
  });
  it("toValueString stringifies objects", () => {
    expect(toValueString(42)).toBe("42");
    expect(toValueString({ a: 1 })).toBe('{"a":1}');
    expect(toValueString(null)).toBe("");
  });
});

describe("feedItemIds", () => {
  it("reads RSS guids / links", () => {
    const rss = `<rss><channel>
      <item><title>A</title><guid>g1</guid></item>
      <item><title>B</title><link>https://x/2</link></item>
    </channel></rss>`;
    expect(feedItemIds(rss)).toEqual(["g1", "https://x/2"]);
  });
  it("reads Atom entries", () => {
    const atom = `<feed><entry><id>urn:1</id></entry><entry><link href="https://x/2"/></entry></feed>`;
    expect(feedItemIds(atom)).toEqual(["urn:1", "https://x/2"]);
  });
  it("reads JSON Feed", () => {
    expect(feedItemIds('{"items":[{"id":"1"},{"url":"https://x/2"}]}')).toEqual(["1", "https://x/2"]);
  });
});

describe("inferType + watchId", () => {
  it("infers from fields", () => {
    expect(inferType({ url: "u" })).toBe("page");
    expect(inferType({ url: "u", selector: ".x" })).toBe("selector");
    expect(inferType({ url: "u", path: "a.b" })).toBe("json");
    expect(inferType({ url: "u", type: "feed" })).toBe("feed");
    expect(inferType({ url: "u", header: "etag" })).toBe("header");
    expect(inferType({ url: "u", contains: "sale" })).toBe("content");
    expect(inferType({ url: "u", match: "^v2" })).toBe("content");
  });
  it("watchId is stable and distinguishes targets", () => {
    expect(watchId({ url: "u", selector: ".x" })).toBe(watchId({ url: "u", selector: ".x" }));
    expect(watchId({ url: "u", selector: ".x" })).not.toBe(watchId({ url: "u", selector: ".y" }));
    expect(watchId({ url: "u", id: "fixed" })).toBe("fixed");
  });
});

describe("diffSnapshots", () => {
  it("no prev = baseline (not changed)", () => {
    expect(diffSnapshots(undefined, snapshotValue("a"), "selector").changed).toBe(false);
  });
  it("value change surfaces before/after", () => {
    const d = diffSnapshots(snapshotValue("$9"), snapshotValue("$10"), "selector");
    expect(d.changed).toBe(true);
    expect(d.before).toBe("$9");
    expect(d.after).toBe("$10");
  });
  it("no change", () => {
    expect(diffSnapshots(snapshotValue("x"), snapshotValue("x"), "page").changed).toBe(false);
  });
  it("feed added/removed", () => {
    const d = diffSnapshots(snapshotItems(["a", "b"]), snapshotItems(["b", "c", "d"]), "feed");
    expect(d.changed).toBe(true);
    expect(d.added).toEqual(["c", "d"]);
    expect(d.removed).toEqual(["a"]);
  });
});

describe("parseNumeric", () => {
  it("pulls a number out of noisy strings", () => {
    expect(parseNumeric("$1,299.00")).toBe(1299);
    expect(parseNumeric("12.5%")).toBe(12.5);
    expect(parseNumeric("v2")).toBe(2);
    expect(parseNumeric("-4 days")).toBe(-4);
    expect(parseNumeric("none")).toBeUndefined();
    expect(parseNumeric(undefined)).toBeUndefined();
  });
});

describe("parseCondition", () => {
  it("parses each operator", () => {
    expect(parseCondition("increased").op).toBe("increased");
    expect(parseCondition("decreased").op).toBe("decreased");
    expect(parseCondition("changed").op).toBe("changed");
    expect(parseCondition("contains:sale")).toMatchObject({ op: "contains", arg: "sale" });
    expect(parseCondition("not-contains:err")).toMatchObject({ op: "not-contains", arg: "err" });
    expect(parseCondition("matches:^v2")).toMatchObject({ op: "matches", arg: "^v2" });
    expect(parseCondition(">100")).toMatchObject({ op: "gt", num: 100 });
    expect(parseCondition("<= 14")).toMatchObject({ op: "lte", num: 14 });
    expect(parseCondition("==200")).toMatchObject({ op: "eq", num: 200 });
    expect(parseCondition("!=active")).toMatchObject({ op: "ne", arg: "active" });
  });
  it("throws on nonsense and bad regex", () => {
    expect(() => parseCondition("wut")).toThrow();
    expect(() => parseCondition("")).toThrow();
    expect(() => parseCondition("matches:(")).toThrow();
  });
});

describe("evalCondition — each operator", () => {
  const ctx = (before: string | undefined, after: string | undefined, changed: boolean) => ({ before, after, changed });
  it("changed", () => {
    expect(evalCondition(parseCondition("changed"), ctx("a", "b", true))).toBe(true);
    expect(evalCondition(parseCondition("changed"), ctx("a", "a", false))).toBe(false);
  });
  it("increased / decreased (price)", () => {
    expect(evalCondition(parseCondition("decreased"), ctx("$10", "$8", true))).toBe(true);
    expect(evalCondition(parseCondition("decreased"), ctx("$8", "$10", true))).toBe(false);
    expect(evalCondition(parseCondition("increased"), ctx("$8", "$10", true))).toBe(true);
    expect(evalCondition(parseCondition("increased"), ctx(undefined, "$10", true))).toBe(false);
  });
  it("contains / not-contains", () => {
    expect(evalCondition(parseCondition("contains:sale"), ctx("", "big sale now", false))).toBe(true);
    expect(evalCondition(parseCondition("contains:sale"), ctx("", "nothing", false))).toBe(false);
    expect(evalCondition(parseCondition("not-contains:error"), ctx("", "all good", false))).toBe(true);
    expect(evalCondition(parseCondition("not-contains:error"), ctx("", "an error", false))).toBe(false);
  });
  it("matches regex", () => {
    expect(evalCondition(parseCondition("matches:^v2\\."), ctx("", "v2.3.1", false))).toBe(true);
    expect(evalCondition(parseCondition("matches:^v2\\."), ctx("", "v1.9", false))).toBe(false);
  });
  it("numeric thresholds", () => {
    expect(evalCondition(parseCondition(">500"), ctx("", "812 ms", false))).toBe(true);
    expect(evalCondition(parseCondition(">500"), ctx("", "120", false))).toBe(false);
    expect(evalCondition(parseCondition("<14"), ctx("", "9", false))).toBe(true);
    expect(evalCondition(parseCondition(">=5"), ctx("", "5", false))).toBe(true);
    expect(evalCondition(parseCondition("<=5"), ctx("", "6", false))).toBe(false);
  });
  it("eq / ne (string + numeric)", () => {
    expect(evalCondition(parseCondition("==200"), ctx("", "200", false))).toBe(true);
    expect(evalCondition(parseCondition("!=200"), ctx("", "503", false))).toBe(true);
    expect(evalCondition(parseCondition("!=200"), ctx("", "200", false))).toBe(false);
    expect(evalCondition(parseCondition("==up"), ctx("", "up", false))).toBe(true);
  });
  it("evalWhen defaults to changed when no rule", () => {
    expect(evalWhen(undefined, ctx("a", "b", true))).toBe(true);
    expect(evalWhen(undefined, ctx("a", "a", false))).toBe(false);
    expect(evalWhen(">100", ctx("", "150", false))).toBe(true);
  });
});

describe("retainHistory", () => {
  it("carries prior values, newest last, capped", () => {
    let snap = snapshotValue("1");
    let prev = undefined as ReturnType<typeof snapshotValue> | undefined;
    const seen: string[][] = [];
    for (const v of ["1", "2", "3", "4", "5", "6", "7"]) {
      const next = retainHistory(prev, snapshotValue(v), 3);
      seen.push((next.history ?? []).map((h) => h.value));
      prev = next;
      snap = next;
    }
    // last snapshot keeps at most 3 prior values
    expect((snap.history ?? []).map((h) => h.value)).toEqual(["4", "5", "6"]);
  });
  it("is a no-op for feed snapshots", () => {
    const feed = snapshotItems(["a"]);
    expect(retainHistory(undefined, feed).history).toBeUndefined();
  });
});

describe("richer diffs", () => {
  it("lineDiff marks add/del/same", () => {
    const ops = lineDiff("a\nb\nc", "a\nB\nc");
    expect(ops.filter((o) => o.type === "del").map((o) => o.value)).toEqual(["b"]);
    expect(ops.filter((o) => o.type === "add").map((o) => o.value)).toEqual(["B"]);
    expect(ops.filter((o) => o.type === "same").map((o) => o.value)).toEqual(["a", "c"]);
  });
  it("wordDiff works at word granularity", () => {
    const ops = wordDiff("the quick fox", "the slow fox");
    expect(ops.some((o) => o.type === "del" && o.value === "quick")).toBe(true);
    expect(ops.some((o) => o.type === "add" && o.value === "slow")).toBe(true);
  });
  it("jsonDiff reports path-level changes", () => {
    const changes = jsonDiff('{"a":1,"b":{"c":2},"d":3}', '{"a":1,"b":{"c":9},"e":4}');
    const paths = changes.map((c) => `${c.path}:${c.kind}`).sort();
    expect(paths).toContain("b.c:changed");
    expect(paths).toContain("d:removed");
    expect(paths).toContain("e:added");
  });
  it("jsonDiff is safe on non-JSON", () => {
    expect(jsonDiff("hello", "world")).toEqual([{ path: "$", kind: "changed", before: "hello", after: "world" }]);
  });
});

describe("sslDaysUntil", () => {
  const now = new Date("2026-09-06T00:00:00Z");
  it("computes whole days from a fixed notAfter", () => {
    expect(sslDaysUntil(new Date("2026-09-20T00:00:00Z"), now)).toBe(14);
    expect(sslDaysUntil("2026-09-06T12:00:00Z", now)).toBe(0);
    expect(sslDaysUntil("2026-09-01T00:00:00Z", now)).toBe(-5);
  });
  it("parses the OpenSSL valid_to form", () => {
    expect(sslDaysUntil("Sep 20 00:00:00 2026 GMT", now)).toBe(14);
  });
});
