import { describe, it, expect } from "vitest";
import { toMatchInlineSnapshot, SnapshotMismatchError } from "./index";

describe("toMatchInlineSnapshot", () => {
  it("passes when the snapshot matches", () => {
    const r = toMatchInlineSnapshot({ b: 2, a: 1 }, 'Object {\n  "a": 1,\n  "b": 2,\n}');
    expect(r.pass).toBe(true);
    expect(r.expected).not.toBeNull();
  });

  it("ignores only leading/trailing whitespace of expected", () => {
    const r = toMatchInlineSnapshot(
      { a: 1 },
      `
        Object {
  "a": 1,
}
      `,
    );
    expect(r.pass).toBe(true);
  });

  it("returns the produced snapshot when expected is omitted (never fails)", () => {
    const r = toMatchInlineSnapshot([1, 2]);
    expect(r.pass).toBe(true);
    expect(r.expected).toBeNull();
    expect(r.actual).toBe("Array [\n  1,\n  2,\n]");
    expect(r.message).toContain("Paste the following");
    expect(r.message).toContain("Array [");
  });

  it("throws SnapshotMismatchError on mismatch by default", () => {
    let err: unknown;
    try {
      toMatchInlineSnapshot({ a: 1 }, 'Object {\n  "a": 2,\n}');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SnapshotMismatchError);
    expect((err as SnapshotMismatchError).result.pass).toBe(false);
    expect((err as SnapshotMismatchError).message).toContain("- Expected");
    expect((err as SnapshotMismatchError).message).toContain("+ Received");
  });

  it("returns a failing result when throwOnMismatch is false", () => {
    const r = toMatchInlineSnapshot({ a: 1 }, "wrong", { throwOnMismatch: false });
    expect(r.pass).toBe(false);
    expect(r.actual).toBe('Object {\n  "a": 1,\n}');
    expect(r.message).toContain("mismatch");
  });

  it("threads serialize options through", () => {
    const r = toMatchInlineSnapshot({ a: 1 }, 'Object {\n    "a": 1,\n}', { indent: 4 });
    expect(r.pass).toBe(true);
  });

  it("supports a custom serializer via options", () => {
    const r = toMatchInlineSnapshot(
      { id: 1 },
      "ID:1",
      {
        serializers: [{ test: (v) => typeof v === "object" && v !== null, serialize: (v) => `ID:${(v as { id: number }).id}` }],
      },
    );
    expect(r.pass).toBe(true);
  });
});
