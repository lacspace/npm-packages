/**
 * @lacspace/consent — core store.
 *
 * A tiny, framework-agnostic cookie-consent manager: track which categories the
 * visitor agreed to (analytics / marketing / preferences), persist the decision
 * to localStorage AND a cookie (so your server can read it too), and notify
 * subscribers on change. No DOM, no React here — that lives in the entry / `/react`.
 */

export type ConsentCategory = "necessary" | "analytics" | "marketing" | "preferences";

export const OPTIONAL_CATEGORIES: ConsentCategory[] = ["analytics", "marketing", "preferences"];

export interface ConsentState {
  /** Always granted — the site can't function without it. */
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
  /** ISO timestamp of the visitor's decision, or null if they haven't chosen yet. */
  decidedAt: string | null;
}

export type ConsentChoice = Partial<Pick<ConsentState, "analytics" | "marketing" | "preferences">>;

export interface ConsentOptions {
  /** localStorage / cookie key. Default "lacspace-consent". */
  storageKey?: string;
  /** Also mirror the decision to a cookie (so the server can gate too). Default true. */
  cookie?: boolean;
  /** Cookie lifetime in days. Default 180. */
  cookieMaxAgeDays?: number;
}

export interface ConsentManager {
  /** Current state (defaults to everything optional = false, undecided). */
  get(): ConsentState;
  /** Merge a partial choice, mark decided, persist and notify. */
  set(choice: ConsentChoice): ConsentState;
  /** Grant every category. */
  acceptAll(): ConsentState;
  /** Deny every optional category (necessary stays on). */
  rejectAll(): ConsentState;
  /** Has the visitor granted this category? */
  has(category: ConsentCategory): boolean;
  /** Has the visitor made any choice yet? (controls whether to show the banner). */
  decided(): boolean;
  /** Forget the decision (e.g. a "change cookie settings" link). */
  reset(): void;
  subscribe(listener: (state: ConsentState) => void): () => void;
}

const DEFAULT_KEY = "lacspace-consent";

function defaultState(): ConsentState {
  return { necessary: true, analytics: false, marketing: false, preferences: false, decidedAt: null };
}

/** Normalize any parsed object into a valid ConsentState. */
function coerce(raw: unknown): ConsentState {
  const state = defaultState();
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    state.analytics = r.analytics === true;
    state.marketing = r.marketing === true;
    state.preferences = r.preferences === true;
    state.decidedAt = typeof r.decidedAt === "string" ? r.decidedAt : null;
  }
  return state;
}

/**
 * Parse a consent state from a raw Cookie header — for server-side gating.
 * Returns null if the cookie isn't present or is unreadable.
 *
 * @example
 * const consent = parseConsentCookie(req.headers.cookie ?? "");
 * if (consent?.analytics) renderAnalyticsTag();
 */
export function parseConsentCookie(cookieHeader: string, storageKey = DEFAULT_KEY): ConsentState | null {
  const match = cookieHeader.split(/;\s*/).find((c) => c.startsWith(`${storageKey}=`));
  if (!match) return null;
  try {
    return coerce(JSON.parse(decodeURIComponent(match.slice(storageKey.length + 1))));
  } catch {
    return null;
  }
}

export function createConsent(options: ConsentOptions = {}): ConsentManager {
  const key = options.storageKey ?? DEFAULT_KEY;
  const useCookie = options.cookie ?? true;
  const maxAgeDays = options.cookieMaxAgeDays ?? 180;

  const listeners = new Set<(state: ConsentState) => void>();

  const readStorage = (): ConsentState => {
    if (typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem(key);
        if (raw) return coerce(JSON.parse(raw));
      } catch {
        /* private mode / disabled — fall through */
      }
    }
    if (useCookie && typeof document !== "undefined") {
      const fromCookie = parseConsentCookie(document.cookie, key);
      if (fromCookie) return fromCookie;
    }
    return defaultState();
  };

  let state = readStorage();

  const persist = () => {
    const serialized = JSON.stringify(state);
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(key, serialized);
      } catch {
        /* ignore */
      }
    }
    if (useCookie && typeof document !== "undefined") {
      const maxAge = maxAgeDays * 24 * 60 * 60;
      document.cookie = `${key}=${encodeURIComponent(serialized)}; path=/; max-age=${maxAge}; SameSite=Lax`;
    }
  };

  const emit = () => {
    for (const listener of listeners) listener(state);
  };

  const commit = (choice: ConsentChoice): ConsentState => {
    state = {
      necessary: true,
      analytics: choice.analytics ?? state.analytics,
      marketing: choice.marketing ?? state.marketing,
      preferences: choice.preferences ?? state.preferences,
      decidedAt: new Date().toISOString(),
    };
    persist();
    emit();
    return state;
  };

  return {
    get: () => state,
    set: (choice) => commit(choice),
    acceptAll: () => commit({ analytics: true, marketing: true, preferences: true }),
    rejectAll: () => commit({ analytics: false, marketing: false, preferences: false }),
    has: (category) => (category === "necessary" ? true : state[category] === true),
    decided: () => state.decidedAt !== null,
    reset: () => {
      state = defaultState();
      if (typeof localStorage !== "undefined") {
        try {
          localStorage.removeItem(key);
        } catch {
          /* ignore */
        }
      }
      if (useCookie && typeof document !== "undefined") {
        document.cookie = `${key}=; path=/; max-age=0; SameSite=Lax`;
      }
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * Run `fn` as soon as a category is (or becomes) consented — the clean way to
 * defer loading an analytics/marketing script until permission exists. Returns an
 * unsubscribe function.
 *
 * @example
 * whenConsent(consent, "analytics", () => loadPlausible());
 */
export function whenConsent(manager: ConsentManager, category: ConsentCategory, fn: () => void): () => void {
  if (manager.has(category)) {
    fn();
    return () => {};
  }
  let done = false;
  const off = manager.subscribe((state) => {
    const granted = category === "necessary" ? true : state[category] === true;
    if (granted && !done) {
      done = true;
      fn();
      off();
    }
  });
  return off;
}
