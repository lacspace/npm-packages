/** A point in time: a Date, an ISO 8601 string or epoch milliseconds. */
export type TimeInput = Date | string | number;

export type StepCondition = "always" | "no_reply" | "no_open" | "opened" | "clicked" | "no_click";

export interface Delay {
  /** Calendar days. The local time of day is kept, so a DST switch does not shift it. */
  days?: number;
  /** Elapsed hours. May be fractional. */
  hours?: number;
  /** Elapsed minutes. */
  minutes?: number;
  /** Business days (the window's days, else Mon–Fri, minus holidays). Keeps the local time of day. */
  businessDays?: number;
}

export interface Step {
  /** Unique within the sequence. */
  id: string;
  /** Shorthand for `delay.hours` (added to it when both are set). */
  delayHours?: number;
  /** Counted from the previous step's send (or skip), or from `enrolledAt` for step 0. */
  delay?: Delay;
  /** Your template id. Never read by this package; passed back to you in the send action. */
  templateId?: string;
  /** Shorthand for `condition: "no_reply"`. */
  onlyIfNoReply?: boolean;
  condition?: StepCondition;
  /** "previous" puts the previous sent messageId into the send action's `threadWith`. */
  threadWith?: "previous" | "none";
}

export interface Window {
  /** Allowed weekdays, 0 = Sunday … 6 = Saturday. Overrides weekdaysOnly. Nepal: [0,1,2,3,4,5]. */
  days?: number[];
  /** Local start time "HH:MM". Wins over startHour. */
  start?: string;
  /** Local end time "HH:MM" (exclusive). "24:00" is allowed. Wins over endHour. */
  end?: string;
  /** Local start hour, fractional ok (9.5 = 09:30). */
  startHour?: number;
  /** Local end hour (exclusive), fractional ok. */
  endHour?: number;
  /** Mon–Fri only. Ignored when `days` is set. */
  weekdaysOnly?: boolean;
  /** "YYYY-MM-DD" local dates when nothing is sent. */
  holidays?: string[];
  /** IANA zone used when the enrollment has none. */
  timezone?: string;
}
/** Alias of Window, for code where the DOM `Window` name is in the way. */
export type SendWindow = Window;

export type StopTrigger = "reply" | "bounce" | "unsubscribe" | "complaint" | "click" | "meeting_booked" | "manual";

export interface Sequence {
  id: string;
  steps: Step[];
  window?: Window;
  /** Default: reply, bounce, unsubscribe, complaint, manual. */
  stopOn?: StopTrigger[];
  timezone?: string;
}

export type EnrollmentStatus = "active" | "paused" | "replied" | "bounced" | "unsubscribed" | "done" | "failed";

export interface HistoryEntry {
  stepId: string;
  at: string;
  messageId?: string;
  result: "sent" | "skipped" | "failed";
  error?: string;
}

export type EnrollmentEventType =
  | "reply"
  | "open"
  | "click"
  | "bounce"
  | "unsubscribe"
  | "complaint"
  | "meeting_booked"
  | "manual_stop"
  | "pause"
  | "resume";

export interface EnrollmentEvent {
  type: EnrollmentEventType;
  at: string;
  stepId?: string;
}

export interface Enrollment {
  id: string;
  sequenceId?: string;
  contact?: string;
  /** IANA zone of the contact, e.g. "Asia/Kathmandu". */
  timezone?: string;
  enrolledAt: TimeInput;
  status?: EnrollmentStatus;
  history: HistoryEntry[];
  events: EnrollmentEvent[];
}

export type StopReason =
  | "replied"
  | "bounced"
  | "unsubscribed"
  | "complained"
  | "clicked"
  | "meeting_booked"
  | "manual"
  | "completed"
  | "failed";

export interface SendAction {
  type: "send";
  step: Step;
  stepIndex: number;
  /** The scheduled send time (≤ now). */
  at: string;
  /** Previous sent messageId, when the step has threadWith "previous". */
  threadWith?: string;
}
export interface WaitAction {
  type: "wait";
  until: string;
  /** "delay" | "window" | "retry" */
  reason: string;
}
export interface StopAction {
  type: "stop";
  reason: StopReason;
}
export interface SkipAction {
  type: "skip";
  step: Step;
  stepIndex: number;
  reason: string;
}
export interface PausedAction {
  type: "paused";
}
export type Action = SendAction | WaitAction | StopAction | SkipAction | PausedAction;

export type AdvanceEvent =
  | { type: "sent"; stepId: string; messageId?: string; at: string }
  | { type: "skipped"; stepId: string; at: string }
  | { type: "failed"; stepId: string; error: string; at: string }
  | EnrollmentEvent;

export interface NextActionOptions {
  /** Spread sends by 0..jitterMinutes, seeded by (enrollment id, step id). Default 0. */
  jitterMinutes?: number;
  /** After a failed send, wait this long before retrying. Default 10. */
  retryMinutes?: number;
}

export interface Budget {
  perHour: number;
  perDay: number;
  sentThisHour: number;
  sentToday: number;
}

export interface DueResult {
  send: Array<{ enrollmentId: string; action: SendAction }>;
  stop: Array<{ enrollmentId: string; reason: string }>;
  skip: Array<{ enrollmentId: string; stepId: string; reason: string }>;
  /** Enrollments that threw (bad dates, invalid window). They are left alone. */
  errors: Array<{ enrollmentId: string; error: string }>;
}
