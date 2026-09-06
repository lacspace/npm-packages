/**
 * Response rules ("mocking"): match an incoming captured request and return a
 * custom status, headers, body and delay — so the receiver can stand in for a
 * real endpoint. Rules are declared in a JSON file (`--rules rules.json`).
 *
 * Rule shape (all `match` fields optional and AND-combined; first match wins):
 *
 * ```json
 * {
 *   "rules": [
 *     {
 *       "name": "charge ok",
 *       "match": {
 *         "method": "POST",
 *         "path": "/pay",                    // exact, glob (*), or /regex/
 *         "pathPrefix": "/api",
 *         "bodyContains": "charge",
 *         "bodyRegex": "\"amount\":\\d+",
 *         "header": { "x-env": "test" },      // value: exact or "*" (present)
 *         "query": { "mode": "live" }
 *       },
 *       "response": {
 *         "status": 201,
 *         "headers": { "x-mock": "1" },
 *         "json": { "ok": true },             // sets body + json content-type
 *         "body": "raw string instead of json",
 *         "delay": 150
 *       }
 *     }
 *   ]
 * }
 * ```
 */
import type { CapturedRequest } from "./capture.js";

/** The `match` block of a rule. Every present field must match. */
export interface RuleMatch {
  /** HTTP method (case-insensitive; `*` or omitted matches any). */
  method?: string;
  /** Path match: exact, a glob with `*`, or `/regex/flags`. */
  path?: string;
  /** Match when the path starts with this prefix. */
  pathPrefix?: string;
  /** Body contains this substring. */
  bodyContains?: string;
  /** Body matches this regular expression (string source). */
  bodyRegex?: string;
  /** Each header must be present; `"*"` matches any value, else exact (case-insensitive name). */
  header?: Record<string, string>;
  /** Each query param must equal the given value. */
  query?: Record<string, string>;
}

/** The `response` a matched rule produces. */
export interface RuleResponse {
  /** Status code (default 200). */
  status?: number;
  /** Extra response headers. */
  headers?: Record<string, string>;
  /** Response `content-type` (default `application/json`, or none when `body` is raw). */
  contentType?: string;
  /** Raw string body. Ignored when `json` is set. */
  body?: string;
  /** JSON body — stringified and served as `application/json`. */
  json?: unknown;
  /** Delay before responding, in milliseconds. */
  delay?: number;
}

/** One response rule. */
export interface Rule {
  /** Optional label (shown in logs). */
  name?: string;
  match?: RuleMatch;
  response?: RuleResponse;
}

/** The shape of a `rules.json` file. */
export interface RulesFile {
  rules: Rule[];
}

/** A concrete response the receiver should send. */
export interface ResolvedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  delay: number;
}

function headerValue(headers: CapturedRequest["headers"], name: string): string | undefined {
  const want = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === want) {
      const v = headers[key];
      return Array.isArray(v) ? v[0] : v;
    }
  }
  return undefined;
}

function queryValue(query: CapturedRequest["query"], name: string): string | undefined {
  const v = query[name];
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

/** Compile a `/regex/flags` or glob (`*`) or exact string into a matcher. */
function pathMatches(pattern: string, value: string): boolean {
  if (pattern.length > 1 && pattern.startsWith("/") && pattern.lastIndexOf("/") > 0) {
    const last = pattern.lastIndexOf("/");
    const source = pattern.slice(1, last);
    const flags = pattern.slice(last + 1);
    try {
      return new RegExp(source, flags).test(value);
    } catch {
      return pattern === value;
    }
  }
  if (pattern.includes("*")) {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(value);
  }
  return pattern === value;
}

/**
 * Does a captured request satisfy a rule's `match` block? A rule with no
 * `match` (or an empty one) matches everything.
 */
export function matchRule(rule: Rule, record: CapturedRequest): boolean {
  const m = rule.match;
  if (!m) return true;

  if (m.method && m.method !== "*" && m.method.toUpperCase() !== record.method.toUpperCase()) return false;
  if (m.path && !pathMatches(m.path, record.path)) return false;
  if (m.pathPrefix && !record.path.startsWith(m.pathPrefix)) return false;
  if (m.bodyContains && !record.body.includes(m.bodyContains)) return false;
  if (m.bodyRegex) {
    try {
      if (!new RegExp(m.bodyRegex).test(record.body)) return false;
    } catch {
      return false;
    }
  }
  if (m.header) {
    for (const [name, expected] of Object.entries(m.header)) {
      const actual = headerValue(record.headers, name);
      if (actual === undefined) return false;
      if (expected !== "*" && actual !== expected) return false;
    }
  }
  if (m.query) {
    for (const [name, expected] of Object.entries(m.query)) {
      if (queryValue(record.query, name) !== expected) return false;
    }
  }
  return true;
}

/** Find the first rule that matches, or `undefined`. */
export function findRule(rules: Rule[], record: CapturedRequest): Rule | undefined {
  return rules.find((r) => matchRule(r, record));
}

/** Turn a matched rule's `response` into a concrete {@link ResolvedResponse}. */
export function resolveResponse(rule: Rule): ResolvedResponse {
  const r = rule.response ?? {};
  const headers: Record<string, string> = { ...(r.headers ?? {}) };
  let body: string;
  if (r.json !== undefined) {
    body = JSON.stringify(r.json);
    if (!hasHeaderCI(headers, "content-type")) headers["content-type"] = r.contentType ?? "application/json";
  } else {
    body = r.body ?? "";
    if (r.contentType && !hasHeaderCI(headers, "content-type")) headers["content-type"] = r.contentType;
  }
  return {
    status: r.status ?? 200,
    headers,
    body,
    delay: r.delay && r.delay > 0 ? r.delay : 0,
  };
}

function hasHeaderCI(headers: Record<string, string>, name: string): boolean {
  const want = name.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === want);
}

/** Validate + normalize a parsed `rules.json` object into a `Rule[]`. Throws on bad shape. */
export function normalizeRules(input: unknown): Rule[] {
  const arr = Array.isArray(input)
    ? input
    : input && typeof input === "object" && Array.isArray((input as RulesFile).rules)
      ? (input as RulesFile).rules
      : null;
  if (!arr) throw new Error('rules file must be a JSON array or an object with a "rules" array');
  return arr.map((raw, i) => {
    if (!raw || typeof raw !== "object") throw new Error(`rule #${i} is not an object`);
    const rule = raw as Rule;
    if (rule.match !== undefined && (typeof rule.match !== "object" || rule.match === null)) {
      throw new Error(`rule #${i} has an invalid "match"`);
    }
    if (rule.response !== undefined && (typeof rule.response !== "object" || rule.response === null)) {
      throw new Error(`rule #${i} has an invalid "response"`);
    }
    return rule;
  });
}
