/** What kind of thing a watch tracks. */
export type WatchType =
  | "page"
  | "selector"
  | "json"
  | "feed"
  | "text"
  | "content"
  | "status"
  | "header"
  | "response-time"
  | "ssl-expiry"
  | "availability";

/** A single thing to watch for changes. */
export interface Watch {
  /** Stable id; derived from the target when omitted. */
  id?: string;
  /** The URL to check. */
  url: string;
  /** What to watch. Inferred from the other fields when omitted. */
  type?: WatchType;
  /** For `selector`: a CSS selector on the page. */
  selector?: string;
  /** For `selector`: read this attribute instead of text (e.g. `@href`). */
  attr?: string;
  /** For `json`: a dot path into the JSON response, e.g. `data.price`. */
  path?: string;
  /** For `header`: the response header name to watch (e.g. `etag`). */
  header?: string;
  /**
   * For `content`: alert on the presence/absence of text/regex in the page.
   * `contains` → watch whether the text appears; `absent` → whether it is gone;
   * `match` → a regular expression source.
   */
  contains?: string;
  absent?: string;
  match?: string;
  /**
   * A condition that gates the alert, e.g. `increased`, `decreased`, `changed`,
   * `contains:sale`, `not-contains:error`, `matches:^v2`, `>100`, `<14`,
   * `==200`, `!=active`. When omitted the alert fires on any change (as before).
   */
  when?: string;
  /** A human label for reports. */
  label?: string;
  /** Extra request headers. */
  headers?: Record<string, string>;
}

/** A point-in-time capture of a watch's value. */
export interface Snapshot {
  hash: string;
  /** The scalar value (page/selector/json/text/status/header/etc.). */
  value?: string;
  /** The item ids (feed). */
  items?: string[];
  /** ISO timestamp. */
  at: string;
  /** A small retained ring of prior values (newest last), for trend/history. */
  history?: { at: string; value: string }[];
}

/** The outcome of checking one watch. */
export interface CheckResult {
  id: string;
  label: string;
  url: string;
  type: WatchType;
  changed: boolean;
  /**
   * Whether this result should raise an alert. Equals `changed` when no `when`
   * condition is set; otherwise the result of evaluating that condition.
   */
  alerted: boolean;
  /** The condition that was evaluated (when a `when` rule was set). */
  condition?: string;
  /** True on the first-ever check (baseline captured, not a "change"). */
  baseline: boolean;
  before?: string;
  after?: string;
  /** New feed items since last check. */
  added?: string[];
  /** Feed items that disappeared. */
  removed?: string[];
  error?: string;
  at: string;
}

/** Persisted state: watch id → last snapshot. */
export type MonitorState = Record<string, Snapshot>;

/** SMTP transport config for the e-mail notifier. */
export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  /** Implicit TLS (usually port 465). Otherwise STARTTLS is attempted. */
  secure?: boolean;
  from?: string;
}

/** A place to deliver alerts. */
export type NotifyChannel =
  | { kind: "webhook"; url: string }
  | { kind: "slack"; url: string }
  | { kind: "discord"; url: string }
  | { kind: "telegram"; botToken: string; chatId: string }
  | { kind: "email"; to: string; smtp: SmtpConfig };

/** One appended history record. */
export interface HistoryEntry {
  at: string;
  id: string;
  label: string;
  url: string;
  type: WatchType;
  before?: string;
  after?: string;
  added?: string[];
  removed?: string[];
  condition?: string;
}

/** A monitor config (the JSON file passed to `--config`). */
export interface MonitorConfig {
  watches: Watch[];
  /** POST changed results to this webhook URL. */
  webhook?: string;
  /** Additional notifier channels. */
  notify?: NotifyChannel[];
  /** State file path (default `.lacspace-monitor.json`). */
  state?: string;
  /** Append every detected change to this NDJSON history log. */
  history?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}
