/** What kind of thing a watch tracks. */
export type WatchType = "page" | "selector" | "json" | "feed" | "text";

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
  /** A human label for reports. */
  label?: string;
  /** Extra request headers. */
  headers?: Record<string, string>;
}

/** A point-in-time capture of a watch's value. */
export interface Snapshot {
  hash: string;
  /** The scalar value (page/selector/json/text). */
  value?: string;
  /** The item ids (feed). */
  items?: string[];
  /** ISO timestamp. */
  at: string;
}

/** The outcome of checking one watch. */
export interface CheckResult {
  id: string;
  label: string;
  url: string;
  type: WatchType;
  changed: boolean;
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

/** A monitor config (the JSON file passed to `--config`). */
export interface MonitorConfig {
  watches: Watch[];
  /** POST changed results to this webhook URL. */
  webhook?: string;
  /** State file path (default `.lacspace-monitor.json`). */
  state?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}
