import { describe, expect, it } from "vitest";
import { advance, afterSend, settle } from "./index";
import type { Enrollment, Sequence } from "./index";

const seq: Sequence = { id: "s", steps: [{ id: "a", delayHours: 0 }, { id: "b", delayHours: 48 }] };
const base: Enrollment = { id: "e", enrolledAt: "2026-10-07T00:00:00Z", history: [], events: [] };

describe("settle / afterSend (1.1.0)", () => {
  it("afterSend records the send and returns the next send time", () => {
    const r = afterSend(seq, base, { stepId: "a", messageId: "<m1>", at: "2026-10-07T00:00:00Z" });
    expect(r.enrollment.history).toHaveLength(1);
    expect(r.enrollment.history[0]).toMatchObject({ stepId: "a", result: "sent", messageId: "<m1>" });
    expect(r.nextAt).toBe("2026-10-09T00:00:00.000Z");
    expect(r.stopReason).toBeUndefined();
    expect(base.history).toHaveLength(0);
  });
  it("marks done after the last step", () => {
    const one = afterSend(seq, base, { stepId: "a", at: "2026-10-07T00:00:00Z" }).enrollment;
    const r = afterSend(seq, one, { stepId: "b", at: "2026-10-09T00:00:00Z" });
    expect(r).toMatchObject({ nextAt: null, stopReason: "completed" });
    expect(r.enrollment.status).toBe("done");
  });
  it("maps a reply, complaint and manual stop to stored statuses", () => {
    const replied = advance(base, { type: "reply", at: "2026-10-07T01:00:00Z" });
    expect(settle(seq, replied, "2026-10-07T02:00:00Z")).toMatchObject({ stopReason: "replied", enrollment: { status: "replied" } });
    const complained = advance(base, { type: "complaint", at: "2026-10-07T01:00:00Z" });
    expect(settle(seq, complained, "2026-10-07T02:00:00Z").enrollment.status).toBe("unsubscribed");
    const manual = advance(base, { type: "manual_stop", at: "2026-10-07T01:00:00Z" });
    expect(settle(seq, manual, "2026-10-07T02:00:00Z").enrollment.status).toBe("done");
  });
  it("returns null nextAt while paused, without changing status beyond advance()", () => {
    const paused = advance(base, { type: "pause", at: "2026-10-07T01:00:00Z" });
    const r = settle(seq, paused, "2026-10-07T02:00:00Z");
    expect(r.nextAt).toBeNull();
    expect(r.stopReason).toBeUndefined();
    expect(r.enrollment.status).toBe("paused");
  });
});
