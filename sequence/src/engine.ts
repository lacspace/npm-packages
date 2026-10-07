import { addDelay, fitToWindow, jitterMs, normalizeWindow, resolveTz, stepDelay, windowEndAt } from "./schedule";
import { toIso, toMs } from "./tz";
import type {
  Action,
  AdvanceEvent,
  Budget,
  DueResult,
  Enrollment,
  EnrollmentEvent,
  EnrollmentStatus,
  HistoryEntry,
  NextActionOptions,
  SendAction,
  Sequence,
  StepCondition,
  StopReason,
  StopTrigger,
  TimeInput,
} from "./types";

export const DEFAULT_STOP_ON: StopTrigger[] = ["reply", "bounce", "unsubscribe", "complaint", "manual"];
export const MAX_CONSECUTIVE_FAILURES = 3;

const EVENT_TRIGGER: Partial<Record<EnrollmentEvent["type"], StopTrigger>> = {
  reply: "reply",
  bounce: "bounce",
  unsubscribe: "unsubscribe",
  complaint: "complaint",
  click: "click",
  meeting_booked: "meeting_booked",
  manual_stop: "manual",
};

const TRIGGER_REASON: Record<StopTrigger, StopReason> = {
  reply: "replied",
  bounce: "bounced",
  unsubscribe: "unsubscribed",
  complaint: "complained",
  click: "clicked",
  meeting_booked: "meeting_booked",
  manual: "manual",
};

const TERMINAL_STATUS: Partial<Record<EnrollmentStatus, StopReason>> = {
  replied: "replied",
  bounced: "bounced",
  unsubscribed: "unsubscribed",
  done: "completed",
  failed: "failed",
};

/** True for statuses that already mean "stopped". */
export function isTerminalStatus(status: EnrollmentStatus | undefined): boolean {
  return status !== undefined && TERMINAL_STATUS[status] !== undefined;
}

interface TimedEvent {
  ev: EnrollmentEvent;
  ms: number;
}

function sortedEvents(e: Enrollment): TimedEvent[] {
  return (e.events ?? [])
    .map((ev, i) => ({ ev, ms: toMs(ev.at as TimeInput), i }))
    .sort((a, b) => a.ms - b.ms || a.i - b.i)
    .map(({ ev, ms }) => ({ ev, ms }));
}

function trailingFailures(history: HistoryEntry[]): number {
  let n = 0;
  for (let i = history.length - 1; i >= 0 && history[i]!.result === "failed"; i--) n++;
  return n;
}

function conditionOf(step: Sequence["steps"][number]): StepCondition {
  return step.condition ?? (step.onlyIfNoReply ? "no_reply" : "always");
}

function lastSent(history: HistoryEntry[]): { entry: HistoryEntry; ms: number } | undefined {
  let best: { entry: HistoryEntry; ms: number } | undefined;
  for (const h of history) {
    if (h.result !== "sent") continue;
    const ms = toMs(h.at as TimeInput);
    if (!best || ms >= best.ms) best = { entry: h, ms };
  }
  return best;
}

/** Why a condition is not met, or null when it is. Opens include clicks (a click implies an open). */
function conditionFailure(cond: StepCondition, since: TimedEvent[]): string | null {
  const has = (...types: string[]) => since.some((x) => types.includes(x.ev.type));
  switch (cond) {
    case "no_reply":
      return has("reply") ? "replied" : null;
    case "opened":
      return has("open", "click") ? null : "not_opened";
    case "no_open":
      return has("open", "click") ? "opened" : null;
    case "clicked":
      return has("click") ? null : "not_clicked";
    case "no_click":
      return has("click") ? "clicked" : null;
    default:
      return null;
  }
}

/**
 * What to do with an enrollment right now. Pure: no I/O, no clock reads.
 * "send" is returned only when its scheduled time is ≤ now.
 */
export function nextAction(
  sequence: Sequence,
  enrollment: Enrollment,
  now: TimeInput,
  opts: NextActionOptions = {},
): Action {
  const nowMs = toMs(now);
  const status = enrollment.status ?? "active";
  const terminal = TERMINAL_STATUS[status];
  if (terminal) return { type: "stop", reason: terminal };

  const events = sortedEvents(enrollment);
  const stopOn = new Set<StopTrigger>(sequence.stopOn ?? DEFAULT_STOP_ON);
  for (const { ev } of events) {
    const trigger = EVENT_TRIGGER[ev.type];
    if (trigger && stopOn.has(trigger)) return { type: "stop", reason: TRIGGER_REASON[trigger] };
  }

  let lastPauseResume: EnrollmentEvent | undefined;
  for (const { ev } of events) if (ev.type === "pause" || ev.type === "resume") lastPauseResume = ev;
  const paused = lastPauseResume ? lastPauseResume.type === "pause" : status === "paused";
  if (paused) return { type: "paused" };

  const history = enrollment.history ?? [];
  const failures = trailingFailures(history);
  if (failures >= MAX_CONSECUTIVE_FAILURES) return { type: "stop", reason: "failed" };

  const steps = sequence.steps ?? [];
  const indexOf = new Map(steps.map((s, i) => [s.id, i] as const));
  let lastDone = -1;
  for (const h of history) {
    if (h.result === "failed") continue;
    const i = indexOf.get(h.stepId);
    if (i !== undefined && i > lastDone) lastDone = i;
  }
  const idx = lastDone + 1;
  if (idx >= steps.length) return { type: "stop", reason: "completed" };
  const step = steps[idx]!;

  const enrolledMs = toMs(enrollment.enrolledAt);
  let baseMs = enrolledMs;
  if (idx > 0) {
    const prevId = steps[idx - 1]!.id;
    for (const h of history) {
      if (h.stepId === prevId && h.result !== "failed") baseMs = Math.max(baseMs, toMs(h.at as TimeInput));
    }
  }

  const tz = resolveTz(enrollment.timezone, sequence.window?.timezone, sequence.timezone);
  const nw = normalizeWindow(sequence.window);
  const raw = addDelay(baseMs, stepDelay(step), nw, tz);
  let at = fitToWindow(raw, nw, tz);
  let reason = raw > nowMs ? "delay" : "window";

  if (failures > 0) {
    const lastFail = toMs(history[history.length - 1]!.at as TimeInput);
    const retryAt = lastFail + Math.max(0, opts.retryMinutes ?? 10) * 60_000;
    if (retryAt > at) {
      at = fitToWindow(retryAt, nw, tz);
      reason = "retry";
    }
  }

  const j = jitterMs(enrollment.id, step.id, opts.jitterMinutes);
  if (j > 0 && at + j < windowEndAt(at, nw, tz)) at += j;

  if (at > nowMs) return { type: "wait", until: new Date(at).toISOString(), reason };

  const sent = lastSent(history);
  const sinceMs = sent ? sent.ms : enrolledMs;
  const fail = conditionFailure(
    conditionOf(step),
    events.filter((x) => x.ms >= sinceMs),
  );
  if (fail) return { type: "skip", step, stepIndex: idx, reason: fail };

  const action: SendAction = { type: "send", step, stepIndex: idx, at: new Date(at).toISOString() };
  if (step.threadWith === "previous" && sent?.entry.messageId) action.threadWith = sent.entry.messageId;
  return action;
}

/** Record a send result or an event. Pure: returns a new enrollment with every date as an ISO string. */
export function advance(enrollment: Enrollment, event: AdvanceEvent): Enrollment {
  const at = toIso(event.at as TimeInput);
  const history: HistoryEntry[] = (enrollment.history ?? []).map((h) => ({ ...h, at: toIso(h.at as TimeInput) }));
  const events: EnrollmentEvent[] = (enrollment.events ?? []).map((ev) => ({ ...ev, at: toIso(ev.at as TimeInput) }));
  const next: Enrollment = { ...enrollment, enrolledAt: toIso(enrollment.enrolledAt), history, events };

  switch (event.type) {
    case "sent": {
      const entry: HistoryEntry = { stepId: event.stepId, at, result: "sent" };
      if (event.messageId !== undefined) entry.messageId = event.messageId;
      history.push(entry);
      break;
    }
    case "skipped":
      history.push({ stepId: event.stepId, at, result: "skipped" });
      break;
    case "failed":
      history.push({ stepId: event.stepId, at, result: "failed", error: event.error });
      if (trailingFailures(history) >= MAX_CONSECUTIVE_FAILURES && !isTerminalStatus(next.status)) next.status = "failed";
      break;
    default: {
      const ev: EnrollmentEvent = { type: event.type, at };
      if (event.stepId !== undefined) ev.stepId = event.stepId;
      events.push(ev);
      if (event.type === "pause" && !isTerminalStatus(next.status)) next.status = "paused";
      if (event.type === "resume" && next.status === "paused") next.status = "active";
    }
  }
  return next;
}

/** The `at` of the next send (skipping steps whose condition already fails), or null when stopped, paused or done. */
export function nextRun(
  sequence: Sequence,
  enrollment: Enrollment,
  now: TimeInput,
  opts: NextActionOptions = {},
): string | null {
  const nowIso = toIso(now);
  let cur = enrollment;
  for (let i = 0; i <= (sequence.steps?.length ?? 0) + 1; i++) {
    const a = nextAction(sequence, cur, nowIso, opts);
    if (a.type === "send") return a.at;
    if (a.type === "wait") return a.until;
    if (a.type !== "skip") return null;
    cur = advance(cur, { type: "skipped", stepId: a.step.id, at: nowIso });
  }
  return null;
}

/**
 * One scheduler tick. Sends are sorted oldest `at` first and cut to the remaining budget.
 * Enrollments already in a stopped status are ignored.
 */
export function due(
  enrollments: Enrollment[],
  sequences: Record<string, Sequence>,
  now: TimeInput,
  budget: Budget,
  opts: NextActionOptions = {},
): DueResult {
  const out: DueResult = { send: [], stop: [], skip: [], errors: [] };
  const nowIso = toIso(now);
  for (const e of enrollments) {
    if (isTerminalStatus(e.status)) continue;
    const seq = e.sequenceId !== undefined && Object.prototype.hasOwnProperty.call(sequences, e.sequenceId)
      ? sequences[e.sequenceId]
      : undefined;
    if (!seq) {
      out.stop.push({ enrollmentId: e.id, reason: "unknown_sequence" });
      continue;
    }
    let a: Action;
    try {
      a = nextAction(seq, e, nowIso, opts);
    } catch (err) {
      out.errors.push({ enrollmentId: e.id, error: err instanceof Error ? err.message : String(err) });
      continue;
    }
    if (a.type === "send") out.send.push({ enrollmentId: e.id, action: a });
    else if (a.type === "stop") out.stop.push({ enrollmentId: e.id, reason: a.reason });
    else if (a.type === "skip") out.skip.push({ enrollmentId: e.id, stepId: a.step.id, reason: a.reason });
  }
  out.send.sort((x, y) => (x.action.at < y.action.at ? -1 : x.action.at > y.action.at ? 1 : x.enrollmentId < y.enrollmentId ? -1 : x.enrollmentId > y.enrollmentId ? 1 : 0));
  const num = (n: number) => (Number.isNaN(n) ? 0 : n);
  const left = Math.max(0, Math.min(num(budget.perHour) - num(budget.sentThisHour), num(budget.perDay) - num(budget.sentToday)));
  if (out.send.length > left) out.send.length = Math.floor(left);
  return out;
}

/** Planned send times for every step, assuming nothing stops or skips the sequence. */
export function previewTimeline(
  sequence: Sequence,
  opts: { start: TimeInput; timezone?: string },
): Array<{ stepId: string; at: string }> {
  const tz = resolveTz(opts.timezone, sequence.window?.timezone, sequence.timezone);
  const nw = normalizeWindow(sequence.window);
  let base = toMs(opts.start);
  return (sequence.steps ?? []).map((step) => {
    base = fitToWindow(addDelay(base, stepDelay(step), nw, tz), nw, tz);
    return { stepId: step.id, at: new Date(base).toISOString() };
  });
}

/** Enrollment status for a stop reason (clicked, meeting_booked and manual count as done). */
export const STOP_STATUS: Record<StopReason, EnrollmentStatus> = {
  replied: "replied",
  bounced: "bounced",
  unsubscribed: "unsubscribed",
  complained: "unsubscribed",
  clicked: "done",
  meeting_booked: "done",
  manual: "done",
  completed: "done",
  failed: "failed",
};

export interface SettleResult {
  enrollment: Enrollment;
  /** Next send time (ISO), or null when stopped, paused or finished. */
  nextAt: string | null;
  stopReason?: StopReason;
}

/**
 * After recording a send or event with `advance()`, work out the stored state in one call:
 * the next send time and, when the enrollment should stop, its final status.
 * Pure; skippable steps are looked past, as in `nextRun()`.
 */
export function settle(
  sequence: Sequence,
  enrollment: Enrollment,
  now: TimeInput,
  opts: NextActionOptions = {},
): SettleResult {
  const a = nextAction(sequence, enrollment, now, opts);
  if (a.type === "stop") {
    const status = STOP_STATUS[a.reason];
    const next = enrollment.status === status ? enrollment : { ...enrollment, status };
    return { enrollment: next, nextAt: null, stopReason: a.reason };
  }
  return { enrollment, nextAt: nextRun(sequence, enrollment, now, opts) };
}

/** `advance(enrollment, {type:"sent"})` then `settle()`, for the common after-send path. */
export function afterSend(
  sequence: Sequence,
  enrollment: Enrollment,
  sent: { stepId: string; messageId?: string; at: TimeInput },
  now: TimeInput = sent.at,
  opts: NextActionOptions = {},
): SettleResult {
  const ev: AdvanceEvent = { type: "sent", stepId: sent.stepId, at: toIso(sent.at) };
  if (sent.messageId !== undefined) (ev as { messageId?: string }).messageId = sent.messageId;
  return settle(sequence, advance(enrollment, ev), now, opts);
}
