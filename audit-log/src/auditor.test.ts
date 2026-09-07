import { describe, it, expect } from "vitest";
import { createAuditor, type AuditEvent } from "./index";

describe("createAuditor injectable clock + id", () => {
  it("stamps `at` from an injected clock (Date)", () => {
    const fixed = new Date("2026-03-01T12:00:00.000Z");
    const auditor = createAuditor({ now: () => fixed });
    const e = auditor.record({ actor: { id: "alice" }, action: "login" });
    expect(e.at).toBe("2026-03-01T12:00:00.000Z");
  });

  it("accepts an ISO string from the injected clock", () => {
    const auditor = createAuditor({ now: () => "2026-03-02T00:00:00.000Z" });
    expect(auditor.record({ actor: { id: "a" }, action: "x" }).at).toBe("2026-03-02T00:00:00.000Z");
  });

  it("uses an injected id generator", () => {
    let n = 0;
    const auditor = createAuditor({ id: () => `evt-${++n}` });
    expect(auditor.record({ actor: { id: "a" }, action: "x" }).id).toBe("evt-1");
    expect(auditor.record({ actor: { id: "a" }, action: "y" }).id).toBe("evt-2");
  });

  it("caller-supplied id/at still win over the injected clock/id", () => {
    const auditor = createAuditor({ now: () => "2026-03-02T00:00:00.000Z", id: () => "gen" });
    const e = auditor.record({ id: "mine", at: "2026-01-01T00:00:00.000Z", actor: { id: "a" }, action: "x" });
    expect(e.id).toBe("mine");
    expect(e.at).toBe("2026-01-01T00:00:00.000Z");
  });

  it("carries the optional actor.userAgent through", () => {
    const auditor = createAuditor();
    const e: AuditEvent = auditor.record({
      actor: { id: "a", userAgent: "Mozilla/5.0" },
      action: "login",
    });
    expect(e.actor.userAgent).toBe("Mozilla/5.0");
  });
});
