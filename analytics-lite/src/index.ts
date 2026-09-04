/**
 * @lacspace/analytics-lite
 * Privacy-first, cookieless web analytics — page views and custom events sent
 * to your own endpoint. No cookies, no localStorage identifiers, no cross-site
 * tracking, no consent banner required. Respects Do-Not-Track by default.
 *
 * ```ts
 * import { createAnalytics } from "@lacspace/analytics-lite";
 *
 * const analytics = createAnalytics({ endpoint: "/api/collect", siteId: "acme" });
 * analytics.pageview();
 * const stop = analytics.autoTrack();   // auto page views on SPA navigation
 * analytics.track("signup", { plan: "pro" });
 * ```
 *
 * Zero dependencies · isomorphic (no-ops on the server) · fully typed.
 */

export interface AnalyticsConfig {
  /** URL that receives the events (your own collector). */
  endpoint: string;
  /** Identifies which site/app the events belong to. */
  siteId: string;
  /** Honour the browser's Do-Not-Track setting. Default `true`. */
  respectDNT?: boolean;
  /** Log payloads to the console instead of sending. Default `false`. */
  debug?: boolean;
  /** Extra fields attached to every event. */
  globalProps?: Record<string, string | number | boolean>;
}

export type EventProps = Record<string, string | number | boolean | null | undefined>;

export interface AnalyticsEvent {
  /** `"pageview"` or a custom event name. */
  type: string;
  siteId: string;
  /** Path + query (no hash), e.g. "/pricing". */
  path: string;
  /** Referrer host only (no full URL / query) — privacy-preserving. */
  referrer: string;
  /** Viewport size like "1920x1080". */
  screen: string;
  /** Two-letter-ish language, e.g. "en". */
  language: string;
  /** Ephemeral, per-page-load id — NOT persisted, so it can't track across visits. */
  sid: string;
  /** Milliseconds since epoch. */
  ts: number;
  /** Custom event properties. */
  props?: EventProps;
}

export interface Analytics {
  pageview(path?: string): void;
  track(name: string, props?: EventProps): void;
  /** Auto-send a pageview on SPA route changes. Returns a cleanup function. */
  autoTrack(): () => void;
  /** True if events are actually being sent (browser + not DNT-blocked). */
  readonly enabled: boolean;
}

/** Internal event fired when history.pushState/replaceState changes the URL. */
const LOCATION_CHANGE = "lacspace:locationchange";
/** Symbol under which the shared history patch (originals + refcount) is stashed. */
const HISTORY_PATCH = Symbol.for("@lacspace/analytics-lite/history-patch");
interface HistoryPatch {
  origPush: History["pushState"];
  origReplace: History["replaceState"];
  refs: number;
}
type HistoryWithPatch = History & { [HISTORY_PATCH]?: HistoryPatch };

const isBrowser = (): boolean => typeof window !== "undefined" && typeof document !== "undefined";

function dntEnabled(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { doNotTrack?: string; msDoNotTrack?: string };
  const w = window as Window & { doNotTrack?: string };
  const v = nav.doNotTrack || w.doNotTrack || nav.msDoNotTrack;
  return v === "1" || v === "yes";
}

/** Short random id for a single page load (Math.random is fine — it's ephemeral). */
function ephemeralId(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

function referrerHost(): string {
  try {
    if (!document.referrer) return "";
    const u = new URL(document.referrer);
    // Same-site referrers are noise; drop them.
    if (u.host === location.host) return "";
    return u.host;
  } catch {
    return "";
  }
}

export function createAnalytics(config: AnalyticsConfig): Analytics {
  const respectDNT = config.respectDNT ?? true;
  const sid = isBrowser() ? ephemeralId() : "";
  const enabled = isBrowser() && !(respectDNT && dntEnabled());

  function send(type: string, path?: string, props?: EventProps): void {
    if (!enabled) return;
    const event: AnalyticsEvent = {
      type,
      siteId: config.siteId,
      path: path ?? location.pathname + location.search,
      referrer: referrerHost(),
      screen: `${window.innerWidth}x${window.innerHeight}`,
      language: (navigator.language || "").split("-")[0] || "",
      sid,
      ts: Date.now(),
      ...(config.globalProps || props ? { props: { ...config.globalProps, ...props } } : {}),
    };

    if (config.debug) {
      // eslint-disable-next-line no-console
      console.log("[analytics-lite]", event);
      return;
    }

    const body = JSON.stringify(event);
    // Prefer sendBeacon so events survive page unload; fall back to fetch.
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      try {
        const blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon(config.endpoint, blob)) return;
      } catch {
        /* fall through to fetch */
      }
    }
    try {
      void fetch(config.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
        credentials: "omit",
      });
    } catch {
      /* swallow — analytics must never break the app */
    }
  }

  return {
    enabled,
    pageview(path) {
      send("pageview", path);
    },
    track(name, props) {
      send(name, undefined, props);
    },
    autoTrack() {
      if (!enabled) return () => {};
      let last = location.pathname + location.search;
      const fire = () => {
        const current = location.pathname + location.search;
        if (current !== last) {
          last = current;
          send("pageview");
        }
      };

      // Patch history at most once, even across repeated autoTrack() calls.
      // The true originals are stashed on the history object under a symbol —
      // capturing history.pushState here on a second call would grab an
      // already-patched wrapper, so a naive cleanup would "restore" the wrapper
      // (double-fire + leak). The patched methods just broadcast a shared event;
      // each autoTrack subscribes to it, and the LAST cleanup restores the
      // genuine originals via the stashed refs.
      const h = history as HistoryWithPatch;
      if (!h[HISTORY_PATCH]) {
        const origPush = history.pushState;
        const origReplace = history.replaceState;
        history.pushState = function (this: History, ...args: Parameters<History["pushState"]>) {
          const r = origPush.apply(this, args);
          window.dispatchEvent(new Event(LOCATION_CHANGE));
          return r;
        };
        history.replaceState = function (this: History, ...args: Parameters<History["replaceState"]>) {
          const r = origReplace.apply(this, args);
          window.dispatchEvent(new Event(LOCATION_CHANGE));
          return r;
        };
        h[HISTORY_PATCH] = { origPush, origReplace, refs: 0 };
      }
      const patch = h[HISTORY_PATCH]!;
      patch.refs++;
      window.addEventListener(LOCATION_CHANGE, fire);
      window.addEventListener("popstate", fire);

      // Initial view.
      send("pageview");

      let cleaned = false;
      return () => {
        if (cleaned) return;
        cleaned = true;
        window.removeEventListener(LOCATION_CHANGE, fire);
        window.removeEventListener("popstate", fire);
        if (--patch.refs <= 0 && h[HISTORY_PATCH] === patch) {
          history.pushState = patch.origPush;
          history.replaceState = patch.origReplace;
          delete h[HISTORY_PATCH];
        }
      };
    },
  };
}
