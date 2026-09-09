/**
 * @lacspace/logger
 *
 * A tiny structured logger for Node and the browser — leveled, JSON-first,
 * with child loggers, field redaction and pluggable transports. Zero
 * dependencies, isomorphic, and fast: a log below the active level costs
 * almost nothing (no object is built).
 *
 * @example
 * import { createLogger } from "@lacspace/logger";
 * const log = createLogger({ level: "info", bindings: { service: "api" } });
 * log.info("server started", { port: 3000 });
 * const reqLog = log.child({ reqId: "abc" });
 * reqLog.warn("slow query", { ms: 1200 });
 */

/* ------------------------------ levels ------------------------------ */

export type Level = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/** Numeric severity for each level (higher = more severe). Pino-compatible. */
export const LEVELS: Record<Level, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const LEVEL_NAMES = Object.keys(LEVELS) as Level[];

/** A single, fully-resolved log entry handed to every transport. */
export interface LogRecord {
  level: Level;
  /** Numeric severity (see {@link LEVELS}). */
  levelValue: number;
  /** Epoch milliseconds. */
  time: number;
  msg: string;
  /** Merged bindings + per-call fields, already redacted. */
  fields: Record<string, unknown>;
}

/** A sink for log records. Built-ins: {@link jsonConsole}, {@link prettyConsole}, {@link memory}. */
export type Transport = (record: LogRecord) => void;

/* ------------------------------ options ------------------------------ */

export interface LoggerOptions {
  /** Minimum level to emit, or "silent" to drop everything. Default "info". */
  level?: Level | "silent";
  /** Fields merged into every record from this logger (and its children). */
  bindings?: Record<string, unknown>;
  /** Where records go. Default: a single {@link jsonConsole} transport. */
  transports?: Transport[];
  /** Clock override (epoch ms) — handy for deterministic tests. */
  now?: () => number;
  /**
   * Field paths to redact before a record leaves the logger. Supports dotted
   * paths (`user.token`) and a single-segment wildcard (`*.password`, `req.*`).
   */
  redact?: string[];
  /** Replacement for redacted values. Default "[redacted]". */
  redactText?: string;
}

export interface Logger {
  /** Current threshold. Assignable at runtime: `log.level = "debug"`. */
  level: Level | "silent";
  trace(msg: string, fields?: Record<string, unknown>): void;
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  fatal(msg: string, fields?: Record<string, unknown>): void;
  /** Log at an arbitrary level. */
  log(level: Level, msg: string, fields?: Record<string, unknown>): void;
  /** A new logger that merges `bindings` into every record (inherits everything else). */
  child(bindings: Record<string, unknown>): Logger;
  /** True if a record at `level` would currently be emitted. */
  isLevelEnabled(level: Level): boolean;
}

/* ------------------------------ serialisation ------------------------------ */

/** Convert an Error to a plain, JSON-safe object. Exposed for custom transports. */
export function serializeError(err: Error): { name: string; message: string; stack?: string } {
  const out: { name: string; message: string; stack?: string } = { name: err.name, message: err.message };
  if (err.stack) out.stack = err.stack;
  return out;
}

function normalizeFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(fields)) {
    const v = fields[key];
    out[key] = v instanceof Error ? serializeError(v) : v;
  }
  return out;
}

/* ------------------------------ redaction ------------------------------ */

function redactRecord(fields: Record<string, unknown>, paths: string[], text: string): Record<string, unknown> {
  if (paths.length === 0) return fields;
  // Deep-ish clone so we never mutate the caller's objects.
  const clone: Record<string, unknown> = Array.isArray(fields) ? ([...fields] as never) : { ...fields };
  for (const path of paths) applyRedaction(clone, path.split("."), text);
  return clone;
}

function applyRedaction(node: unknown, segments: string[], text: string): void {
  if (node === null || typeof node !== "object") return;
  const [head, ...rest] = segments;
  if (head === undefined) return;
  const obj = node as Record<string, unknown>;
  const keys = head === "*" ? Object.keys(obj) : head in obj ? [head] : [];
  for (const key of keys) {
    if (rest.length === 0) {
      obj[key] = text;
    } else {
      const child = obj[key];
      // Shallow-copy nested objects on the way down so redaction stays non-destructive.
      if (child && typeof child === "object") {
        const copy: Record<string, unknown> = Array.isArray(child) ? ([...child] as never) : { ...child };
        obj[key] = copy;
        applyRedaction(copy, rest, text);
      }
    }
  }
}

/* ------------------------------ factory ------------------------------ */

function levelValue(level: Level | "silent"): number {
  return level === "silent" ? Infinity : LEVELS[level];
}

/** Create a logger. All options are optional; sane defaults get you going. */
export function createLogger(options: LoggerOptions = {}): Logger {
  const bindings = { ...(options.bindings ?? {}) };
  const transports = options.transports ?? [jsonConsole()];
  const now = options.now ?? Date.now;
  const redactPaths = options.redact ?? [];
  const redactText = options.redactText ?? "[redacted]";
  let threshold = levelValue(options.level ?? "info");
  let currentLevel: Level | "silent" = options.level ?? "info";

  function emit(level: Level, msg: string, fields?: Record<string, unknown>): void {
    const lv = LEVELS[level];
    if (lv < threshold) return; // cheap early-out — no record built
    const merged = normalizeFields({ ...bindings, ...(fields ?? {}) });
    const redacted = redactRecord(merged, redactPaths, redactText);
    const record: LogRecord = { level, levelValue: lv, time: now(), msg, fields: redacted };
    for (const t of transports) t(record);
  }

  const logger: Logger = {
    get level() {
      return currentLevel;
    },
    set level(next: Level | "silent") {
      currentLevel = next;
      threshold = levelValue(next);
    },
    trace: (msg, fields) => emit("trace", msg, fields),
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
    fatal: (msg, fields) => emit("fatal", msg, fields),
    log: (level, msg, fields) => emit(level, msg, fields),
    isLevelEnabled: (level) => LEVELS[level] >= threshold,
    child(childBindings) {
      // Children share transports/clock/redaction but merge bindings and track level live.
      const child = createLogger({
        ...options,
        level: currentLevel,
        bindings: { ...bindings, ...childBindings },
        transports,
        now,
      });
      return child;
    },
  };
  return logger;
}

/* ------------------------------ transports ------------------------------ */

/** Flatten a record to the object that gets serialised: `{ level, time, msg, ...fields }`. */
export function toObject(record: LogRecord): Record<string, unknown> {
  return { level: record.level, time: record.time, msg: record.msg, ...record.fields };
}

export interface JsonConsoleOptions {
  /** Console-like sink. Default: the global `console`. */
  out?: Pick<Console, "log" | "warn" | "error">;
  /** Emit `time` as an ISO string instead of epoch ms. Default false. */
  isoTime?: boolean;
}

/** JSON-per-line transport — the machine-readable default (ships to log aggregators cleanly). */
export function jsonConsole(opts: JsonConsoleOptions = {}): Transport {
  const out = opts.out ?? console;
  return (record) => {
    const obj = toObject(record);
    if (opts.isoTime) obj.time = new Date(record.time).toISOString();
    const line = JSON.stringify(obj);
    if (record.levelValue >= LEVELS.error) out.error(line);
    else if (record.levelValue >= LEVELS.warn) out.warn(line);
    else out.log(line);
  };
}

export interface PrettyConsoleOptions {
  out?: Pick<Console, "log" | "warn" | "error">;
  /** Wrap the level tag in ANSI colours (Node TTYs). Default false. */
  colors?: boolean;
}

const COLORS: Record<Level, string> = {
  trace: "\x1b[90m", debug: "\x1b[36m", info: "\x1b[32m", warn: "\x1b[33m", error: "\x1b[31m", fatal: "\x1b[35m",
};
const RESET = "\x1b[0m";

/** Human-readable transport — `2026-09-09T… INFO msg key=value` — for local dev. */
export function prettyConsole(opts: PrettyConsoleOptions = {}): Transport {
  const out = opts.out ?? console;
  return (record) => {
    const ts = new Date(record.time).toISOString();
    const tag = record.level.toUpperCase().padEnd(5);
    const label = opts.colors ? `${COLORS[record.level]}${tag}${RESET}` : tag;
    let extra = "";
    for (const key of Object.keys(record.fields)) {
      const v = record.fields[key];
      extra += ` ${key}=${typeof v === "string" ? v : JSON.stringify(v)}`;
    }
    const line = `${ts} ${label} ${record.msg}${extra}`;
    if (record.levelValue >= LEVELS.error) out.error(line);
    else if (record.levelValue >= LEVELS.warn) out.warn(line);
    else out.log(line);
  };
}

export interface MemoryTransport {
  transport: Transport;
  /** Every record captured, in order. */
  records: LogRecord[];
  /** Flattened `{ level, time, msg, ...fields }` for each captured record. */
  objects(): Record<string, unknown>[];
  clear(): void;
}

/** In-memory transport — captures records for tests or in-app buffers. */
export function memory(): MemoryTransport {
  const records: LogRecord[] = [];
  return {
    transport: (record) => records.push(record),
    records,
    objects: () => records.map(toObject),
    clear: () => {
      records.length = 0;
    },
  };
}
