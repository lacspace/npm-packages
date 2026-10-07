import { parseClock } from "./schedule";
import { isValidTimeZone } from "./tz";
import type { Sequence } from "./types";

const CONDITIONS = ["always", "no_reply", "no_open", "opened", "clicked", "no_click"];
const STOP_ON = ["reply", "bounce", "unsubscribe", "complaint", "click", "meeting_booked", "manual"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isNonNegative(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

/** Check a sequence before saving it. Never throws. */
export function validateSequence(seq: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!seq || typeof seq !== "object") return { ok: false, errors: ["sequence must be an object"] };
  const s = seq as Sequence;
  if (typeof s.id !== "string" || s.id.trim() === "") errors.push("sequence id is required");
  if (s.timezone !== undefined && !isValidTimeZone(s.timezone)) errors.push(`unknown timezone: ${String(s.timezone)}`);

  if (!Array.isArray(s.steps) || s.steps.length === 0) {
    errors.push("steps must be a non-empty array");
  } else {
    const seen = new Set<string>();
    s.steps.forEach((step, i) => {
      const label = `steps[${i}]`;
      if (!step || typeof step !== "object") {
        errors.push(`${label} must be an object`);
        return;
      }
      if (typeof step.id !== "string" || step.id.trim() === "") errors.push(`${label}.id is required`);
      else if (seen.has(step.id)) errors.push(`duplicate step id: ${step.id}`);
      else seen.add(step.id);
      if (step.delayHours !== undefined && !isNonNegative(step.delayHours)) {
        errors.push(`${label}.delayHours must be a non-negative number`);
      }
      if (step.delay !== undefined) {
        if (!step.delay || typeof step.delay !== "object") errors.push(`${label}.delay must be an object`);
        else {
          for (const k of ["days", "hours", "minutes", "businessDays"] as const) {
            const v = step.delay[k];
            if (v !== undefined && !isNonNegative(v)) errors.push(`${label}.delay.${k} must be a non-negative number`);
          }
          if (step.delay.businessDays !== undefined && !Number.isInteger(step.delay.businessDays)) {
            errors.push(`${label}.delay.businessDays must be a whole number`);
          }
        }
      }
      if (step.condition !== undefined && !CONDITIONS.includes(step.condition)) {
        errors.push(`${label}.condition is invalid: ${String(step.condition)}`);
      }
      if (step.threadWith !== undefined && step.threadWith !== "previous" && step.threadWith !== "none") {
        errors.push(`${label}.threadWith is invalid: ${String(step.threadWith)}`);
      }
    });
  }

  if (s.stopOn !== undefined) {
    if (!Array.isArray(s.stopOn)) errors.push("stopOn must be an array");
    else for (const t of s.stopOn) if (!STOP_ON.includes(t)) errors.push(`stopOn has an unknown trigger: ${String(t)}`);
  }

  const w = s.window;
  if (w !== undefined) {
    if (!w || typeof w !== "object") errors.push("window must be an object");
    else {
      if (w.timezone !== undefined && !isValidTimeZone(w.timezone)) errors.push(`unknown timezone: ${String(w.timezone)}`);
      let start: number | null = 0;
      let end: number | null = 1440;
      if (w.start !== undefined) {
        start = parseClock(w.start);
        if (start === null) errors.push(`window.start is not a valid HH:MM time: ${String(w.start)}`);
      } else if (w.startHour !== undefined) {
        start = isNonNegative(w.startHour) && w.startHour <= 24 ? w.startHour * 60 : null;
        if (start === null) errors.push(`window.startHour must be between 0 and 24: ${String(w.startHour)}`);
      }
      if (w.end !== undefined) {
        end = parseClock(w.end);
        if (end === null) errors.push(`window.end is not a valid HH:MM time: ${String(w.end)}`);
      } else if (w.endHour !== undefined) {
        end = isNonNegative(w.endHour) && w.endHour <= 24 ? w.endHour * 60 : null;
        if (end === null) errors.push(`window.endHour must be between 0 and 24: ${String(w.endHour)}`);
      }
      if (start !== null && end !== null && end <= start) errors.push("window end must be after window start");
      if (w.days !== undefined) {
        if (!Array.isArray(w.days) || w.days.length === 0) errors.push("window.days must be a non-empty array");
        else for (const d of w.days) if (!Number.isInteger(d) || d < 0 || d > 6) errors.push(`window.days has an invalid day: ${String(d)}`);
      }
      if (w.holidays !== undefined) {
        if (!Array.isArray(w.holidays)) errors.push("window.holidays must be an array");
        else
          for (const h of w.holidays) {
            const ok = typeof h === "string" && DATE_RE.test(h) && !Number.isNaN(Date.parse(`${h}T00:00:00Z`));
            if (!ok) errors.push(`window.holidays has an invalid date: ${String(h)}`);
          }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
