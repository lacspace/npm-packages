import { describe, it, expect, vi } from "vitest";
import {
  auditEvent,
  diff,
  redactEvent,
  formatEvent,
  createAuditor,
  REDACTED,
  type AuditEvent,
} from "./index";

describe("auditEvent", () => {
  it("fills id and at when missing", () => {
    const e = auditEvent({ actor: { id: "alice" }, action: "login" });
    expect(typeof e.id).toBe("string");
    expect(e.id.length).toBeGreaterThan(0);
    expect(new Date(e.at).toString()).not.toBe("Invalid Date");
  });

  it("preserves supplied id and at", () => {
    const e = auditEvent({
      id: "x1",
      at: "2026-01-01T00:00:00.000Z",
      actor: { id: "bob" },
      action: "logout",
    });
    expect(e.id).toBe("x1");
    expect(e.at).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("diff", () => {
  it("detects changed keys", () => {
    const d = diff({ status: "pending" }, { status: "paid" });
    expect(d).toEqual([{ field: "status", from: "pending", to: "paid" }]);
  });

  it("detects added keys", () => {
    const d = diff({}, { note: "hi" });
    expect(d).toEqual([{ field: "note", from: undefined, to: "hi" }]);
  });

  it("detects removed keys", () => {
    const d = diff({ coupon: "SAVE10" }, {});
    expect(d).toEqual([{ field: "coupon", from: "SAVE10", to: undefined }]);
  });

  it("ignores unchanged keys", () => {
    const d = diff({ a: 1, b: 2 }, { a: 1, b: 3 });
    expect(d).toEqual([{ field: "b", from: 2, to: 3 }]);
  });

  it("uses Object.is semantics: NaN→NaN is not a change", () => {
    expect(diff({ x: NaN }, { x: NaN })).toEqual([]);
  });

  it("distinguishes an explicit undefined value from an absent key", () => {
    // present-with-undefined vs absent are both `undefined` → no change reported
    expect(diff({ a: undefined }, {})).toEqual([]);
    // but a real value change is reported
    expect(diff({ a: undefined }, { a: 1 })).toEqual([{ field: "a", from: undefined, to: 1 }]);
  });

  it("does not mutate its inputs", () => {
    const before = Object.freeze({ a: 1 });
    const after = Object.freeze({ a: 2 });
    expect(() => diff(before, after)).not.toThrow();
    expect(before).toEqual({ a: 1 });
    expect(after).toEqual({ a: 2 });
  });
});

describe("redactEvent", () => {
  it("masks matching change fields and meta, without mutating original", () => {
    const original: AuditEvent = {
      id: "1",
      at: "2026-01-01T00:00:00.000Z",
      actor: { id: "alice" },
      action: "updated",
      changes: [
        { field: "password", from: "old", to: "new" },
        { field: "status", from: "a", to: "b" },
      ],
      meta: { token: "secret", trace: "keep" },
    };
    const red = redactEvent(original, ["password", "token"]);
    expect(red.changes).toEqual([
      { field: "password", from: REDACTED, to: REDACTED },
      { field: "status", from: "a", to: "b" },
    ]);
    expect(red.meta).toEqual({ token: REDACTED, trace: "keep" });
    // original untouched
    expect(original.changes?.[0]).toEqual({
      field: "password",
      from: "old",
      to: "new",
    });
    expect(original.meta?.token).toBe("secret");
  });

  it("does not mutate a frozen event", () => {
    const original: AuditEvent = Object.freeze({
      id: "1",
      at: "2026-01-01T00:00:00.000Z",
      actor: Object.freeze({ id: "alice" }),
      action: "updated",
      changes: Object.freeze([Object.freeze({ field: "pw", from: "a", to: "b" })]),
      meta: Object.freeze({ pw: "x", keep: 1 }),
    }) as unknown as AuditEvent;
    const red = redactEvent(original, ["pw"]);
    expect(red.changes).toEqual([{ field: "pw", from: REDACTED, to: REDACTED }]);
    expect(red.meta).toEqual({ pw: REDACTED, keep: 1 });
    // frozen original is intact
    expect(original.meta?.pw).toBe("x");
  });

  it("redacts a hostile '__proto__' meta key without polluting Object.prototype", () => {
    // Build meta with a genuine OWN '__proto__' key (a literal would set the prototype).
    const meta = JSON.parse('{"__proto__":"leak","keep":1}') as Record<string, unknown>;
    const event: AuditEvent = {
      id: "1",
      at: "2026-01-01T00:00:00.000Z",
      actor: { id: "alice" },
      action: "updated",
      meta,
    };
    const red = redactEvent(event, ["__proto__"]);
    // the dangerous key is redacted as a real own property, and nothing leaks to the prototype
    expect(Object.prototype.hasOwnProperty.call(red.meta, "__proto__")).toBe(true);
    expect((red.meta as Record<string, unknown>)["__proto__"]).toBe(REDACTED);
    expect(red.meta?.keep).toBe(1);
    expect(({} as Record<string, unknown>).leak).toBeUndefined();
  });
});

describe("formatEvent", () => {
  it("renders actor, action, target and changes", () => {
    const e: AuditEvent = {
      id: "1",
      at: "2026-01-01T00:00:00.000Z",
      actor: { id: "alice" },
      action: "updated",
      target: { type: "order", id: "42" },
      changes: [{ field: "status", from: "pending", to: "paid" }],
    };
    expect(formatEvent(e)).toBe("alice updated order#42 (status: pending→paid)");
  });

  it("renders without target or changes", () => {
    const e: AuditEvent = {
      id: "1",
      at: "2026-01-01T00:00:00.000Z",
      actor: { id: "bob" },
      action: "login",
    };
    expect(formatEvent(e)).toBe("bob login");
  });

  it("renders undefined/null/object change values and survives a circular value", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const e: AuditEvent = {
      id: "1",
      at: "2026-01-01T00:00:00.000Z",
      actor: { id: "sys" },
      action: "updated",
      changes: [
        { field: "a", from: undefined, to: null },
        { field: "b", from: { x: 1 }, to: circular },
      ],
    };
    // must not throw on the circular reference
    const line = formatEvent(e);
    expect(line).toContain("a: ∅→null");
    expect(line).toContain('b: {"x":1}→');
  });
});

describe("auditEvent uniqueness", () => {
  it("generates distinct ids across calls", () => {
    const ids = new Set(
      Array.from({ length: 200 }, () => auditEvent({ actor: { id: "a" }, action: "x" }).id),
    );
    expect(ids.size).toBe(200);
  });
});

describe("createAuditor", () => {
  it("calls sink with built + redacted event and returns it", () => {
    const sink = vi.fn();
    const auditor = createAuditor({ sink, redact: ["secret"] });
    const e = auditor.record({
      actor: { id: "alice" },
      action: "updated",
      changes: [{ field: "secret", from: "a", to: "b" }],
      meta: { secret: "x", ok: 1 },
    });
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith(e);
    expect(e.id).toBeTruthy();
    expect(e.at).toBeTruthy();
    expect(e.changes).toEqual([
      { field: "secret", from: REDACTED, to: REDACTED },
    ]);
    expect(e.meta).toEqual({ secret: REDACTED, ok: 1 });
  });

  it("works with no options", () => {
    const auditor = createAuditor();
    const e = auditor.record({ actor: { id: "x" }, action: "ping" });
    expect(e.action).toBe("ping");
  });
});
