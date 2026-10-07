import { describe, expect, it } from "vitest";
import {
  advance,
  due,
  jitterMs,
  nextAction,
  nextRun,
  previewTimeline,
  scheduleStep,
  validateSequence,
  zonedToUtc,
} from "./index";
import type { Enrollment, Sequence } from "./index";

const NOW = "2026-10-07T12:00:00.000Z"; // Wednesday

function enr(over: Partial<Enrollment> = {}): Enrollment {
  return { id: "e1", sequenceId: "s1", contact: "a@b.com", enrolledAt: "2026-10-07T08:00:00.000Z", history: [], events: [], ...over };
}

const basic: Sequence = {
  id: "s1",
  steps: [
    { id: "intro", templateId: "t1" },
    { id: "bump", delay: { days: 2 }, templateId: "t2", threadWith: "previous" },
    { id: "last", delayHours: 72, templateId: "t3" },
  ],
};

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}

describe("scheduleStep: delays", () => {
  it("adds hours as elapsed time", () => {
    expect(scheduleStep("2026-10-07T08:00:00Z", { hours: 5 }, undefined, "UTC")).toBe("2026-10-07T13:00:00.000Z");
  });
  it("adds minutes", () => {
    expect(scheduleStep("2026-10-07T08:00:00Z", { minutes: 90 }, undefined, "UTC")).toBe("2026-10-07T09:30:00.000Z");
  });
  it("adds days keeping local time", () => {
    expect(scheduleStep("2026-10-07T08:00:00Z", { days: 3 }, undefined, "UTC")).toBe("2026-10-10T08:00:00.000Z");
  });
  it("combines days, hours and minutes", () => {
    expect(scheduleStep("2026-10-07T08:00:00Z", { days: 1, hours: 2, minutes: 15 }, undefined, "UTC")).toBe("2026-10-08T10:15:00.000Z");
  });
  it("no delay returns the same instant", () => {
    expect(scheduleStep("2026-10-07T08:00:00Z", undefined, undefined, "UTC")).toBe("2026-10-07T08:00:00.000Z");
  });
  it("accepts Date and number inputs", () => {
    const ms = Date.parse("2026-10-07T08:00:00Z");
    expect(scheduleStep(new Date(ms), { hours: 1 }, undefined, "UTC")).toBe("2026-10-07T09:00:00.000Z");
    expect(scheduleStep(ms as unknown as string, { hours: 1 }, undefined, "UTC")).toBe("2026-10-07T09:00:00.000Z");
  });
  it("rejects a negative delay", () => {
    expect(() => scheduleStep(NOW, { hours: -1 }, undefined, "UTC")).toThrow(RangeError);
  });
  it("businessDays skips the weekend (Fri + 1 = Mon)", () => {
    expect(scheduleStep("2026-10-09T10:00:00Z", { businessDays: 1 }, undefined, "UTC")).toBe("2026-10-12T10:00:00.000Z");
  });
  it("businessDays Wed + 3 = Mon", () => {
    expect(scheduleStep("2026-10-07T10:00:00Z", { businessDays: 3 }, undefined, "UTC")).toBe("2026-10-12T10:00:00.000Z");
  });
  it("businessDays skips holidays", () => {
    const w = { holidays: ["2026-10-12"] };
    expect(scheduleStep("2026-10-09T10:00:00Z", { businessDays: 1 }, w, "UTC")).toBe("2026-10-13T10:00:00.000Z");
  });
  it("businessDays follow window.days (Nepal Sun–Fri: Fri + 1 = Sun)", () => {
    const w = { days: [0, 1, 2, 3, 4, 5], timezone: "Asia/Kathmandu" };
    // Fri 2026-10-09 10:00 NPT = 04:15Z → Sun 2026-10-11 10:00 NPT
    expect(scheduleStep("2026-10-09T04:15:00Z", { businessDays: 1 }, w, "Asia/Kathmandu")).toBe("2026-10-11T04:15:00.000Z");
  });
  it("unknown timezone falls back to UTC", () => {
    expect(scheduleStep("2026-10-07T08:00:00Z", { days: 1 }, undefined, "Mars/Olympus")).toBe("2026-10-08T08:00:00.000Z");
  });
});

describe("windows", () => {
  const w = { start: "09:00", end: "17:00" };
  it("inside the window keeps the time", () => {
    expect(scheduleStep("2026-10-07T10:00:00Z", undefined, w, "UTC")).toBe("2026-10-07T10:00:00.000Z");
  });
  it("before the window rolls to today's start", () => {
    expect(scheduleStep("2026-10-07T06:00:00Z", undefined, w, "UTC")).toBe("2026-10-07T09:00:00.000Z");
  });
  it("after the window rolls to tomorrow's start", () => {
    expect(scheduleStep("2026-10-07T17:00:00Z", undefined, w, "UTC")).toBe("2026-10-08T09:00:00.000Z");
  });
  it("startHour/endHour form with fractional hours", () => {
    const wh = { startHour: 9.5, endHour: 17.25 };
    expect(scheduleStep("2026-10-07T06:00:00Z", undefined, wh, "UTC")).toBe("2026-10-07T09:30:00.000Z");
    expect(scheduleStep("2026-10-07T17:20:00Z", undefined, wh, "UTC")).toBe("2026-10-08T09:30:00.000Z");
    expect(scheduleStep("2026-10-07T17:10:00Z", undefined, wh, "UTC")).toBe("2026-10-07T17:10:00.000Z");
  });
  it("weekdaysOnly skips Saturday and Sunday", () => {
    expect(scheduleStep("2026-10-10T10:00:00Z", undefined, { ...w, weekdaysOnly: true }, "UTC")).toBe("2026-10-12T09:00:00.000Z");
  });
  it("days overrides weekdaysOnly", () => {
    expect(scheduleStep("2026-10-10T10:00:00Z", undefined, { ...w, weekdaysOnly: true, days: [6] }, "UTC")).toBe("2026-10-10T10:00:00.000Z");
  });
  it("skips holidays and consecutive non-days", () => {
    const wh = { ...w, weekdaysOnly: true, holidays: ["2026-10-12", "2026-10-13"] };
    expect(scheduleStep("2026-10-09T18:00:00Z", undefined, wh, "UTC")).toBe("2026-10-14T09:00:00.000Z");
  });
  it("delay then window: lands after hours, rolls forward", () => {
    expect(scheduleStep("2026-10-07T15:00:00Z", { hours: 4 }, w, "UTC")).toBe("2026-10-08T09:00:00.000Z");
  });
  it("throws when end <= start", () => {
    expect(() => scheduleStep(NOW, undefined, { start: "17:00", end: "09:00" }, "UTC")).toThrow(RangeError);
  });
});

describe("Asia/Kathmandu (+05:45)", () => {
  const w = { start: "10:00", end: "17:00" };
  it("rolls 05:45 local to 10:00 local = 04:15Z", () => {
    expect(scheduleStep("2026-10-07T00:00:00Z", undefined, w, "Asia/Kathmandu")).toBe("2026-10-07T04:15:00.000Z");
  });
  it("17:00 local is 11:15Z, so 11:15Z rolls to the next day", () => {
    expect(scheduleStep("2026-10-07T11:14:00Z", undefined, w, "Asia/Kathmandu")).toBe("2026-10-07T11:14:00.000Z");
    expect(scheduleStep("2026-10-07T11:15:00Z", undefined, w, "Asia/Kathmandu")).toBe("2026-10-08T04:15:00.000Z");
  });
  it("holidays use the local date, not the UTC date", () => {
    // 2026-10-07T20:00Z is already 2026-10-08 01:45 in Kathmandu
    const wh = { ...w, holidays: ["2026-10-08"] };
    expect(scheduleStep("2026-10-07T20:00:00Z", undefined, wh, "Asia/Kathmandu")).toBe("2026-10-09T04:15:00.000Z");
  });
  it("zonedToUtc handles the 45-minute offset", () => {
    expect(new Date(zonedToUtc("Asia/Kathmandu", 2026, 10, 7, 9, 0)).toISOString()).toBe("2026-10-07T03:15:00.000Z");
  });
});

describe("America/New_York around DST", () => {
  const tz = "America/New_York";
  it("spring forward: +1 day keeps 09:00 local (EST → EDT)", () => {
    // Sat 2026-03-07 09:00 EST = 14:00Z → Sun 2026-03-08 09:00 EDT = 13:00Z
    expect(scheduleStep("2026-03-07T14:00:00Z", { days: 1 }, undefined, tz)).toBe("2026-03-08T13:00:00.000Z");
  });
  it("spring forward: +24 hours is elapsed time (lands 10:00 EDT)", () => {
    expect(scheduleStep("2026-03-07T14:00:00Z", { hours: 24 }, undefined, tz)).toBe("2026-03-08T14:00:00.000Z");
  });
  it("spring forward: window start on the switch day", () => {
    expect(scheduleStep("2026-03-08T05:00:00Z", undefined, { start: "09:00", end: "17:00" }, tz)).toBe("2026-03-08T13:00:00.000Z");
  });
  it("spring forward: window start inside the gap lands after the gap", () => {
    const at = scheduleStep("2026-03-08T05:00:00Z", undefined, { start: "02:30", end: "17:00" }, tz);
    expect(at).toBe("2026-03-08T07:30:00.000Z"); // 03:30 EDT
  });
  it("fall back: +1 day keeps 09:00 local (EDT → EST)", () => {
    // Sat 2026-10-31 09:00 EDT = 13:00Z → Sun 2026-11-01 09:00 EST = 14:00Z
    expect(scheduleStep("2026-10-31T13:00:00Z", { days: 1 }, undefined, tz)).toBe("2026-11-01T14:00:00.000Z");
  });
  it("fall back: window rolls to 09:00 EST", () => {
    expect(scheduleStep("2026-10-31T22:00:00Z", undefined, { start: "09:00", end: "17:00" }, tz)).toBe("2026-11-01T14:00:00.000Z");
  });
  it("fall back: ambiguous 01:30 resolves to the first occurrence (EDT)", () => {
    expect(new Date(zonedToUtc(tz, 2026, 11, 1, 1, 30)).toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });
});

describe("Nepal Sun–Fri", () => {
  const nepal: Sequence = {
    id: "np",
    steps: [{ id: "a" }, { id: "b", delay: { days: 1 } }],
    window: { days: [0, 1, 2, 3, 4, 5], start: "10:00", end: "17:00", timezone: "Asia/Kathmandu" },
  };
  it("Saturday rolls to Sunday 10:00 NPT", () => {
    // Fri 2026-10-09 17:30 NPT = 11:45Z
    expect(scheduleStep("2026-10-09T11:45:00Z", undefined, nepal.window, "Asia/Kathmandu")).toBe("2026-10-11T04:15:00.000Z");
  });
  it("previewTimeline: Fri send, next step skips Saturday", () => {
    const tl = previewTimeline(nepal, { start: "2026-10-09T05:00:00Z" });
    expect(tl).toEqual([
      { stepId: "a", at: "2026-10-09T05:00:00.000Z" },
      { stepId: "b", at: "2026-10-11T04:15:00.000Z" },
    ]);
  });
  it("nextAction waits until Sunday", () => {
    const e = enr({ sequenceId: "np", enrolledAt: "2026-10-10T06:00:00Z" });
    expect(nextAction(nepal, e, "2026-10-10T06:00:00Z")).toEqual({ type: "wait", until: "2026-10-11T04:15:00.000Z", reason: "window" });
  });
});

describe("nextAction: basics", () => {
  it("sends step 0 at enrolledAt", () => {
    const a = nextAction(basic, enr(), NOW);
    expect(a).toMatchObject({ type: "send", stepIndex: 0, at: "2026-10-07T08:00:00.000Z" });
    expect(a.type === "send" && a.step.templateId).toBe("t1");
  });
  it("waits with the exact time when the delay has not elapsed", () => {
    const e = advance(enr(), { type: "sent", stepId: "intro", messageId: "<m1>", at: "2026-10-07T08:00:00Z" });
    expect(nextAction(basic, e, NOW)).toEqual({ type: "wait", until: "2026-10-09T08:00:00.000Z", reason: "delay" });
  });
  it("send only when at <= now", () => {
    const e = advance(enr(), { type: "sent", stepId: "intro", messageId: "<m1>", at: "2026-10-07T08:00:00Z" });
    expect(nextAction(basic, e, "2026-10-09T07:59:59Z").type).toBe("wait");
    expect(nextAction(basic, e, "2026-10-09T08:00:00Z").type).toBe("send");
  });
  it("delay counts from the previous send, not from enrollment", () => {
    let e = advance(enr(), { type: "sent", stepId: "intro", at: "2026-10-07T08:00:00Z" });
    e = advance(e, { type: "sent", stepId: "bump", at: "2026-10-09T10:00:00Z" });
    expect(nextRun(basic, e, NOW)).toBe("2026-10-12T10:00:00.000Z");
  });
  it("threadWith previous returns the previous messageId", () => {
    const e = advance(enr(), { type: "sent", stepId: "intro", messageId: "<m1@x>", at: "2026-10-07T08:00:00Z" });
    const a = nextAction(basic, e, "2026-10-10T00:00:00Z");
    expect(a).toMatchObject({ type: "send", stepIndex: 1, threadWith: "<m1@x>" });
  });
  it("steps without threadWith have no threadWith", () => {
    let e = advance(enr(), { type: "sent", stepId: "intro", messageId: "<m1>", at: "2026-10-07T08:00:00Z" });
    e = advance(e, { type: "sent", stepId: "bump", messageId: "<m2>", at: "2026-10-09T08:00:00Z" });
    const a = nextAction(basic, e, "2026-10-13T00:00:00Z");
    expect(a.type).toBe("send");
    expect(a.type === "send" && "threadWith" in a).toBe(false);
  });
  it("timezone order: enrollment beats window beats sequence", () => {
    const seq: Sequence = { id: "s", timezone: "America/New_York", window: { start: "09:00", end: "17:00", timezone: "Asia/Kathmandu" }, steps: [{ id: "a" }] };
    const at0 = "2026-10-07T00:00:00Z";
    expect(nextRun(seq, enr({ enrolledAt: at0, timezone: "UTC" }), at0)).toBe("2026-10-07T09:00:00.000Z");
    expect(nextRun(seq, enr({ enrolledAt: at0 }), at0)).toBe("2026-10-07T03:15:00.000Z");
    const noWinTz: Sequence = { ...seq, window: { start: "09:00", end: "17:00" } };
    expect(nextRun(noWinTz, enr({ enrolledAt: at0 }), at0)).toBe("2026-10-07T13:00:00.000Z");
  });
  it("completion: all steps done → stop completed, nextRun null", () => {
    let e = enr();
    for (const s of basic.steps) e = advance(e, { type: "sent", stepId: s.id, at: NOW });
    expect(nextAction(basic, e, NOW)).toEqual({ type: "stop", reason: "completed" });
    expect(nextRun(basic, e, NOW)).toBeNull();
  });
  it("terminal statuses stop", () => {
    expect(nextAction(basic, enr({ status: "done" }), NOW)).toEqual({ type: "stop", reason: "completed" });
    expect(nextAction(basic, enr({ status: "bounced" }), NOW)).toEqual({ type: "stop", reason: "bounced" });
  });
});

describe("stops on events", () => {
  const all: Sequence = { ...basic, stopOn: ["reply", "bounce", "unsubscribe", "complaint", "click", "meeting_booked", "manual"] };
  const cases: Array<[Enrollment["events"][number]["type"], string]> = [
    ["reply", "replied"],
    ["bounce", "bounced"],
    ["unsubscribe", "unsubscribed"],
    ["complaint", "complained"],
    ["click", "clicked"],
    ["meeting_booked", "meeting_booked"],
    ["manual_stop", "manual"],
  ];
  for (const [type, reason] of cases) {
    it(`${type} → stop ${reason}`, () => {
      const e = advance(enr(), { type, at: "2026-10-07T09:00:00Z" });
      expect(nextAction(all, e, NOW)).toEqual({ type: "stop", reason });
      expect(nextRun(all, e, NOW)).toBeNull();
    });
  }
  it("default stopOn ignores click and meeting_booked", () => {
    let e = advance(enr(), { type: "click", at: "2026-10-07T09:00:00Z" });
    e = advance(e, { type: "meeting_booked", at: "2026-10-07T09:00:00Z" });
    expect(nextAction(basic, e, NOW).type).toBe("send");
  });
});

describe("conditions", () => {
  const seq = (condition: NonNullable<Sequence["steps"][number]["condition"]>, extra: Partial<Sequence> = {}): Sequence => ({
    id: "c",
    stopOn: ["bounce"],
    steps: [{ id: "a" }, { id: "b", delayHours: 1, condition }],
    ...extra,
  });
  const sentA = () => advance(enr(), { type: "sent", stepId: "a", messageId: "<a>", at: "2026-10-07T08:00:00Z" });
  const later = "2026-10-07T10:00:00Z";

  it("no_reply skips after a reply when reply is not in stopOn", () => {
    const e = advance(sentA(), { type: "reply", at: "2026-10-07T08:30:00Z" });
    expect(nextAction(seq("no_reply"), e, later)).toMatchObject({ type: "skip", stepIndex: 1, reason: "replied" });
  });
  it("onlyIfNoReply is shorthand for no_reply", () => {
    const s: Sequence = { id: "c", stopOn: [], steps: [{ id: "a" }, { id: "b", delayHours: 1, onlyIfNoReply: true }] };
    const e = advance(sentA(), { type: "reply", at: "2026-10-07T08:30:00Z" });
    expect(nextAction(s, e, later).type).toBe("skip");
    expect(nextAction(s, sentA(), later).type).toBe("send");
  });
  it("replies before the previous send do not count", () => {
    const e0 = advance(enr(), { type: "reply", at: "2026-10-07T07:00:00Z" });
    const e = advance(e0, { type: "sent", stepId: "a", at: "2026-10-07T08:00:00Z" });
    expect(nextAction(seq("no_reply"), e, later).type).toBe("send");
  });
  it("opened sends only after an open", () => {
    expect(nextAction(seq("opened"), sentA(), later)).toMatchObject({ type: "skip", reason: "not_opened" });
    const e = advance(sentA(), { type: "open", at: "2026-10-07T08:10:00Z" });
    expect(nextAction(seq("opened"), e, later).type).toBe("send");
  });
  it("no_open skips after an open", () => {
    expect(nextAction(seq("no_open"), sentA(), later).type).toBe("send");
    const e = advance(sentA(), { type: "open", at: "2026-10-07T08:10:00Z" });
    expect(nextAction(seq("no_open"), e, later)).toMatchObject({ type: "skip", reason: "opened" });
  });
  it("clicked / no_click", () => {
    const e = advance(sentA(), { type: "click", at: "2026-10-07T08:10:00Z" });
    expect(nextAction(seq("clicked"), sentA(), later)).toMatchObject({ type: "skip", reason: "not_clicked" });
    expect(nextAction(seq("clicked"), e, later).type).toBe("send");
    expect(nextAction(seq("no_click"), e, later)).toMatchObject({ type: "skip", reason: "clicked" });
  });
  it("conditions are checked only when the step is due", () => {
    expect(nextAction(seq("opened"), sentA(), "2026-10-07T08:30:00Z").type).toBe("wait");
  });
  it("after a skip, the next step counts from the skip time", () => {
    const s: Sequence = { id: "c", stopOn: [], steps: [{ id: "a" }, { id: "b", delayHours: 1, condition: "opened" }, { id: "c", delayHours: 2 }] };
    const e = advance(sentA(), { type: "skipped", stepId: "b", at: "2026-10-07T10:00:00Z" });
    expect(nextAction(s, e, "2026-10-07T11:00:00Z")).toEqual({ type: "wait", until: "2026-10-07T12:00:00.000Z", reason: "delay" });
    expect(nextRun(s, sentA(), "2026-10-07T10:00:00Z")).toBe("2026-10-07T12:00:00.000Z");
  });
});

describe("pause / resume", () => {
  it("status paused → paused, nextRun null", () => {
    expect(nextAction(basic, enr({ status: "paused" }), NOW)).toEqual({ type: "paused" });
    expect(nextRun(basic, enr({ status: "paused" }), NOW)).toBeNull();
  });
  it("pause event pauses, later resume resumes", () => {
    const p = advance(enr(), { type: "pause", at: "2026-10-07T09:00:00Z" });
    expect(p.status).toBe("paused");
    expect(nextAction(basic, p, NOW).type).toBe("paused");
    const r = advance(p, { type: "resume", at: "2026-10-07T10:00:00Z" });
    expect(r.status).toBe("active");
    expect(nextAction(basic, r, NOW).type).toBe("send");
  });
  it("a resume event resumes even if the stored status is still paused", () => {
    const e = enr({ status: "paused", events: [{ type: "resume", at: "2026-10-07T10:00:00Z" }] });
    expect(nextAction(basic, e, NOW).type).toBe("send");
  });
  it("stop events win over pause", () => {
    let e = advance(enr(), { type: "pause", at: "2026-10-07T09:00:00Z" });
    e = advance(e, { type: "unsubscribe", at: "2026-10-07T09:30:00Z" });
    expect(nextAction(basic, e, NOW)).toEqual({ type: "stop", reason: "unsubscribed" });
  });
});

describe("failures", () => {
  it("retries after a failure (default 10 minutes)", () => {
    const e = advance(enr(), { type: "failed", stepId: "intro", error: "smtp 451", at: "2026-10-07T11:55:00Z" });
    expect(nextAction(basic, e, NOW)).toEqual({ type: "wait", until: "2026-10-07T12:05:00.000Z", reason: "retry" });
    expect(nextAction(basic, e, "2026-10-07T12:05:00Z")).toMatchObject({ type: "send", stepIndex: 0 });
  });
  it("3 consecutive failures → stop failed, and advance sets status failed", () => {
    let e = enr();
    for (let i = 0; i < 3; i++) e = advance(e, { type: "failed", stepId: "intro", error: "x", at: NOW });
    expect(e.status).toBe("failed");
    expect(nextAction(basic, { ...e, status: "active" }, NOW)).toEqual({ type: "stop", reason: "failed" });
  });
  it("a success resets the failure streak", () => {
    let e = enr();
    e = advance(e, { type: "failed", stepId: "intro", error: "x", at: NOW });
    e = advance(e, { type: "failed", stepId: "intro", error: "x", at: NOW });
    e = advance(e, { type: "sent", stepId: "intro", at: NOW });
    e = advance(e, { type: "failed", stepId: "bump", error: "x", at: NOW });
    expect(e.status).not.toBe("failed");
    expect(nextAction(basic, e, "2026-10-20T00:00:00Z").type).toBe("send");
  });
});

describe("jitter", () => {
  it("is deterministic per (enrollmentId, stepId) and within range", () => {
    const a = jitterMs("e1", "intro", 30);
    expect(jitterMs("e1", "intro", 30)).toBe(a);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(30 * 60_000);
    const spread = new Set(Array.from({ length: 20 }, (_, i) => jitterMs(`e${i}`, "intro", 30)));
    expect(spread.size).toBeGreaterThan(10);
  });
  it("nextAction applies the same jitter on every call", () => {
    const e = enr({ enrolledAt: "2026-10-07T08:00:00Z" });
    const a1 = nextAction(basic, e, "2026-10-07T08:00:00Z", { jitterMinutes: 30 });
    const a2 = nextAction(basic, e, "2026-10-07T08:00:00Z", { jitterMinutes: 30 });
    expect(a1).toEqual(a2);
    const expected = new Date(Date.parse("2026-10-07T08:00:00Z") + jitterMs("e1", "intro", 30)).toISOString();
    expect(nextRun(basic, e, "2026-10-07T08:00:00Z", { jitterMinutes: 30 })).toBe(expected);
  });
  it("jitter is dropped when it would leave the window", () => {
    const s: Sequence = { id: "s", steps: [{ id: "a" }], window: { start: "09:00", end: "17:00" } };
    const e = enr({ enrolledAt: "2026-10-07T16:59:59Z" });
    expect(nextRun(s, e, "2026-10-07T16:00:00Z", { jitterMinutes: 1000 })).toBe("2026-10-07T16:59:59.000Z");
  });
});

describe("due()", () => {
  const seqs = { s1: basic };
  const mk = (id: string, enrolledAt: string) => enr({ id, enrolledAt });
  const big = { perHour: 100, perDay: 1000, sentThisHour: 0, sentToday: 0 };

  it("returns sends sorted oldest first", () => {
    const r = due([mk("b", "2026-10-07T10:00:00Z"), mk("a", "2026-10-07T09:00:00Z"), mk("c", "2026-10-07T11:00:00Z")], seqs, NOW, big);
    expect(r.send.map((s) => s.enrollmentId)).toEqual(["a", "b", "c"]);
  });
  it("truncates to the hourly budget", () => {
    const list = ["a", "b", "c", "d"].map((id, i) => mk(id, `2026-10-07T0${i + 1}:00:00Z`));
    const r = due(list, seqs, NOW, { perHour: 10, perDay: 100, sentThisHour: 8, sentToday: 8 });
    expect(r.send.map((s) => s.enrollmentId)).toEqual(["a", "b"]);
  });
  it("truncates to the daily budget", () => {
    const list = ["a", "b", "c"].map((id, i) => mk(id, `2026-10-07T0${i + 1}:00:00Z`));
    const r = due(list, seqs, NOW, { perHour: 100, perDay: 50, sentThisHour: 0, sentToday: 49 });
    expect(r.send).toHaveLength(1);
  });
  it("exhausted or overspent budget sends nothing", () => {
    const list = [mk("a", "2026-10-07T01:00:00Z")];
    expect(due(list, seqs, NOW, { perHour: 10, perDay: 100, sentThisHour: 10, sentToday: 10 }).send).toEqual([]);
    expect(due(list, seqs, NOW, { perHour: 10, perDay: 100, sentThisHour: 12, sentToday: 12 }).send).toEqual([]);
    expect(due(list, seqs, NOW, { perHour: 10, perDay: 5, sentThisHour: 0, sentToday: 5 }).send).toEqual([]);
  });
  it("also returns stops and skips; waits and paused are left out", () => {
    const cond: Sequence = { id: "c", stopOn: [], steps: [{ id: "a" }, { id: "b", condition: "opened" }] };
    const replied = advance(mk("r", "2026-10-07T01:00:00Z"), { type: "reply", at: "2026-10-07T02:00:00Z" });
    const skipper = advance(enr({ id: "k", sequenceId: "c" }), { type: "sent", stepId: "a", at: "2026-10-07T09:00:00Z" });
    const waiting = mk("w", "2026-10-08T01:00:00Z");
    const paused = enr({ id: "p", status: "paused" });
    const r = due([replied, skipper, waiting, paused], { s1: basic, c: cond }, NOW, big);
    expect(r.stop).toEqual([{ enrollmentId: "r", reason: "replied" }]);
    expect(r.skip).toEqual([{ enrollmentId: "k", stepId: "b", reason: "not_opened" }]);
    expect(r.send).toEqual([]);
  });
  it("unknown sequence → stop unknown_sequence; terminal statuses ignored", () => {
    const r = due([enr({ id: "x", sequenceId: "nope" }), enr({ id: "y", sequenceId: undefined }), enr({ id: "z", status: "done" })], seqs, NOW, big);
    expect(r.stop).toEqual([
      { enrollmentId: "x", reason: "unknown_sequence" },
      { enrollmentId: "y", reason: "unknown_sequence" },
    ]);
  });
  it("bad data goes to errors instead of throwing", () => {
    const r = due([enr({ id: "bad", enrolledAt: "not a date" })], seqs, NOW, big);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.enrollmentId).toBe("bad");
  });
});

describe("immutability and plain JSON", () => {
  it("advance never mutates its input", () => {
    const e = deepFreeze(enr({ enrolledAt: new Date("2026-10-07T08:00:00Z") }));
    const n = advance(e, { type: "sent", stepId: "intro", messageId: "<m>", at: NOW });
    expect(e.history).toHaveLength(0);
    expect(n).not.toBe(e);
    expect(n.history).toHaveLength(1);
  });
  it("nextAction, due and previewTimeline work on frozen inputs", () => {
    const e = deepFreeze(enr());
    const s = deepFreeze(structuredClone(basic));
    expect(() => nextAction(s, e, NOW)).not.toThrow();
    expect(() => due([e], { s1: s }, NOW, { perHour: 1, perDay: 1, sentThisHour: 0, sentToday: 0 })).not.toThrow();
    expect(() => previewTimeline(s, { start: NOW })).not.toThrow();
  });
  it("advance writes ISO strings even from Date/number input", () => {
    const e = enr({ enrolledAt: Date.parse("2026-10-07T08:00:00Z") });
    const n = advance(e, { type: "open", at: new Date("2026-10-07T09:00:00Z") as unknown as string });
    expect(n.enrolledAt).toBe("2026-10-07T08:00:00.000Z");
    expect(n.events[0]!.at).toBe("2026-10-07T09:00:00.000Z");
  });
  it("JSON round-trip behaves the same", () => {
    let e = enr({ enrolledAt: new Date("2026-10-07T08:00:00Z") });
    e = advance(e, { type: "sent", stepId: "intro", messageId: "<m1>", at: "2026-10-07T08:00:00Z" });
    e = advance(e, { type: "open", at: "2026-10-07T08:30:00Z" });
    const copy = JSON.parse(JSON.stringify(e)) as Enrollment;
    expect(copy).toEqual(e);
    for (const t of [NOW, "2026-10-09T08:00:00Z", "2026-10-20T00:00:00Z"]) {
      expect(nextAction(basic, copy, t)).toEqual(nextAction(basic, e, t));
      expect(nextRun(basic, copy, t)).toBe(nextRun(basic, e, t));
    }
  });
});

describe("previewTimeline", () => {
  it("chains delays through the window", () => {
    const s: Sequence = { ...basic, window: { start: "09:00", end: "17:00", weekdaysOnly: true } };
    expect(previewTimeline(s, { start: "2026-10-07T18:00:00Z", timezone: "UTC" })).toEqual([
      { stepId: "intro", at: "2026-10-08T09:00:00.000Z" },
      { stepId: "bump", at: "2026-10-12T09:00:00.000Z" }, // Sat 10th → Mon
      { stepId: "last", at: "2026-10-15T09:00:00.000Z" },
    ]);
  });
});

describe("validateSequence", () => {
  it("accepts a good sequence", () => {
    expect(validateSequence({ ...basic, window: { start: "09:00", end: "17:00", timezone: "Asia/Kathmandu", days: [0, 1, 2, 3, 4, 5], holidays: ["2026-10-20"] } })).toEqual({ ok: true, errors: [] });
  });
  it("flags empty steps", () => {
    expect(validateSequence({ id: "s", steps: [] }).errors).toContain("steps must be a non-empty array");
  });
  it("flags duplicate ids and negative delays", () => {
    const r = validateSequence({ id: "s", steps: [{ id: "a", delayHours: -1 }, { id: "a" }, { id: "b", delay: { days: -2 } }] });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("duplicate step id: a");
    expect(r.errors).toContain("steps[0].delayHours must be a non-negative number");
    expect(r.errors).toContain("steps[2].delay.days must be a non-negative number");
  });
  it("flags unknown timezones", () => {
    const r = validateSequence({ id: "s", steps: [{ id: "a" }], timezone: "Nowhere/City", window: { timezone: "Bad/Zone" } });
    expect(r.errors).toEqual(["unknown timezone: Nowhere/City", "unknown timezone: Bad/Zone"]);
  });
  it("flags bad times and end <= start", () => {
    expect(validateSequence({ id: "s", steps: [{ id: "a" }], window: { start: "25:00", end: "9am" } }).errors).toEqual([
      "window.start is not a valid HH:MM time: 25:00",
      "window.end is not a valid HH:MM time: 9am",
    ]);
    expect(validateSequence({ id: "s", steps: [{ id: "a" }], window: { start: "17:00", end: "09:00" } }).errors).toContain("window end must be after window start");
    expect(validateSequence({ id: "s", steps: [{ id: "a" }], window: { startHour: 10, endHour: 10 } }).errors).toContain("window end must be after window start");
  });
  it("flags bad days, holidays, stopOn and conditions", () => {
    const r = validateSequence({
      id: "s",
      steps: [{ id: "a", condition: "maybe" as never }],
      stopOn: ["sneeze" as never],
      window: { days: [7], holidays: ["2026-13-45", "tomorrow"] },
    });
    expect(r.errors).toEqual([
      "steps[0].condition is invalid: maybe",
      "stopOn has an unknown trigger: sneeze",
      "window.days has an invalid day: 7",
      "window.holidays has an invalid date: 2026-13-45",
      "window.holidays has an invalid date: tomorrow",
    ]);
  });
  it("never throws on junk", () => {
    expect(validateSequence(null).ok).toBe(false);
    expect(validateSequence("x").ok).toBe(false);
  });
});
