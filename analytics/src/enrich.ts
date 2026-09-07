/**
 * @lacspace/analytics — enrichment helpers.
 *
 * UTM / campaign parsing, a timeout-based session id, and the middleware type
 * used to transform or redact events before they are sent. All zero-dependency
 * and isomorphic.
 */

/** Marketing campaign attribution parsed from `utm_*` query parameters. */
export interface Campaign {
  source?: string;
  medium?: string;
  name?: string;
  term?: string;
  content?: string;
  /** Non-standard `utm_*` params kept verbatim (without the `utm_` prefix). */
  [key: string]: string | undefined;
}

const UTM_MAP: Record<string, keyof Campaign> = {
  utm_source: "source",
  utm_medium: "medium",
  utm_campaign: "name",
  utm_term: "term",
  utm_content: "content",
};

/**
 * Parse UTM / campaign parameters from a URL (or a bare query string).
 * Returns `undefined` when no `utm_*` parameters are present.
 */
export function parseUtm(url: string): Campaign | undefined {
  if (!url) return undefined;
  const q = url.indexOf("?");
  const query = q === -1 ? url : url.slice(q + 1);
  const search = query.split("#")[0] ?? "";
  if (!search) return undefined;

  const campaign: Campaign = {};
  let found = false;
  for (const pair of search.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    const rawVal = eq === -1 ? "" : pair.slice(eq + 1);
    let key: string;
    let val: string;
    try {
      key = decodeURIComponent(rawKey.replace(/\+/g, " ")).toLowerCase();
      val = decodeURIComponent(rawVal.replace(/\+/g, " "));
    } catch {
      continue;
    }
    if (!key.startsWith("utm_")) continue;
    found = true;
    const mapped = UTM_MAP[key];
    if (mapped) campaign[mapped] = val;
    else campaign[key.slice(4)] = val;
  }
  return found ? campaign : undefined;
}

/** A session id that renews after a period of inactivity. */
export interface Session {
  /** The current session id, renewing it when the timeout has elapsed. */
  id(): string;
  /** Milliseconds since epoch of the last activity. */
  readonly lastActivity: number;
  /** Force a brand-new session on the next `id()` call. */
  reset(): void;
}

/** Options for {@link createSession}. */
export interface SessionOptions {
  /** Inactivity window before a new session starts, in ms. Default 30 min. */
  timeout?: number;
  /** Clock, injectable for tests. Default `Date.now`. */
  now?: () => number;
  /** Id generator. Default a random hex string. */
  genId?: () => string;
}

function fallbackId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.getRandomValues === "function") {
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    let s = "";
    for (let i = 0; i < b.length; i++) s += (b[i]! + 0x100).toString(16).slice(1);
    return s;
  }
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

/**
 * Create a session tracker whose id renews after `timeout` ms of inactivity.
 * Every call to `id()` counts as activity and slides the window forward.
 */
export function createSession(options: SessionOptions = {}): Session {
  const timeout = options.timeout ?? 30 * 60 * 1000;
  const now = options.now ?? Date.now;
  const genId = options.genId ?? fallbackId;

  let current: string | undefined;
  let last = 0;

  return {
    id(): string {
      const t = now();
      if (current === undefined || t - last > timeout) current = genId();
      last = t;
      return current;
    },
    get lastActivity(): number {
      return last;
    },
    reset(): void {
      current = undefined;
    },
  };
}

/**
 * A middleware transforms an event before it is enqueued. Return the (possibly
 * mutated) event to keep it, or `null` to drop it entirely (e.g. redaction).
 */
export type Middleware<T> = (event: T) => T | null;

/** Run an event through a middleware chain; returns `null` if any drops it. */
export function applyMiddleware<T>(event: T, chain: readonly Middleware<T>[]): T | null {
  let current: T | null = event;
  for (const mw of chain) {
    if (current === null) return null;
    current = mw(current);
  }
  return current;
}
