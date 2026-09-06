import { describe, it, expect } from "vitest";
import {
  hashValue, getByPath, toValueString, feedItemIds, inferType, watchId,
  snapshotValue, snapshotItems, diffSnapshots,
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
