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
