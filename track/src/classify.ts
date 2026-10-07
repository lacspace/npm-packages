/**
 * Heuristic classification of tracked opens and clicks. These are
 * heuristics, not facts: the result carries a confidence and a reason.
 */

export type OpenKind = "human" | "apple-mpp" | "bot" | "proxy";
export type ClickKind = "human" | "bot";

export interface Classification<K extends string> {
  kind: K;
  /** 0..1, how sure the heuristic is. */
  confidence: number;
  reason: string;
}

export interface OpenEvent {
  userAgent?: string | null;
  ip?: string | null;
  at: Date;
  sentAt: Date;
  /**
   * Optional hook: return true if `ip` is in Apple's published Private
   * Relay / Mail Privacy Protection egress ranges. This package does not ship
   * an IP list (it changes); load Apple's published list yourself if you want
   * this signal.
   */
  isAppleProxyIp?: (ip: string) => boolean;
  /** Opens sooner than this after sending are treated as automated. Default 2. */
  botSeconds?: number;
}

export interface ClickEvent {
  userAgent?: string | null;
  ip?: string | null;
  at: Date;
  sentAt: Date;
  /** HTTP method of the request; HEAD requests are never humans. */
  method?: string;
  /**
   * Other clicks from the same recipient on the same message. If several
   * distinct links are hit within `burstSeconds` of this one, it looks like a
   * link scanner following every link.
   */
  recentClicks?: Array<{ url: string; at: Date }>;
  /** This click's URL (used with recentClicks). */
  url?: string;
  /** Clicks sooner than this after sending are treated as automated. Default 5. */
  botSeconds?: number;
  /** Window for burst detection. Default 3. */
  burstSeconds?: number;
  /** Distinct links in the window that count as a burst. Default 3. */
  burstLinks?: number;
}

/** User-agent fragments of security gateways, link scanners and generic HTTP clients. */
const BOT_UA =
  /bot\b|crawl|spider|slurp|curl\/|wget|python-requests|python-urllib|aiohttp|go-http-client|java\/|okhttp|libwww|httpclient|apache-http|axios\/|node-fetch|undici|got \(|headless|phantomjs|puppeteer|playwright|selenium|barracuda|mimecast|proofpoint|ironport|messagelabs|symantec|forcepoint|trend ?micro|sophos|fortinet|fortiguard|zscaler|paloalto|checkpoint|cloudmark|vade|appriver|safelinks|preview|scanner|monitor|uptime|\bfacebookexternalhit|slackbot|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|skypeuripreview/i;

function ua(s: string | null | undefined): string {
  return typeof s === "string" ? s.trim() : "";
}

function secondsBetween(at: Date, sentAt: Date): number | null {
  const a = at instanceof Date ? at.getTime() : NaN;
  const b = sentAt instanceof Date ? sentAt.getTime() : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return (a - b) / 1000;
}

/**
 * Classify a pixel load.
 *
 * - Apple Mail Privacy Protection fetches remote images through Apple's
 *   proxy, generally soon after delivery and whether or not the message is
 *   read. Those requests have been widely observed to carry the bare user
 *   agent "Mozilla/5.0". That UA (optionally with your Apple IP check) gives
 *   "apple-mpp": the open is not evidence that a person read the email.
 * - Gmail's image proxy ("GoogleImageProxy") and Yahoo's proxy fetch images on
 *   behalf of the reader. Gmail is generally reported to fetch when the
 *   message is opened, so the first proxy hit is likely a real open, but later
 *   hits may be served from Google's cache and never reach you. "proxy".
 * - Known scanners / HTTP clients, missing UA, or a load within a couple of
 *   seconds of sending: "bot".
 */
export function classifyOpen(ev: OpenEvent): Classification<OpenKind> {
  const agent = ua(ev?.userAgent);
  const ip = typeof ev?.ip === "string" ? ev.ip.trim() : "";
  const delta = secondsBetween(ev?.at, ev?.sentAt);
  const botSeconds = typeof ev?.botSeconds === "number" ? ev.botSeconds : 2;
  let appleIp = false;
  if (ip && typeof ev?.isAppleProxyIp === "function") {
    try {
      appleIp = ev.isAppleProxyIp(ip) === true;
    } catch {
      appleIp = false;
    }
  }

  if (/GoogleImageProxy/i.test(agent)) {
    return {
      kind: "proxy",
      confidence: 0.7,
      reason: "Gmail image proxy (GoogleImageProxy); the first fetch is likely a real open, repeats may be cached by Google",
    };
  }
  if (/YahooMailProxy/i.test(agent)) {
    return { kind: "proxy", confidence: 0.6, reason: "Yahoo Mail image proxy (YahooMailProxy)" };
  }
  if (agent === "Mozilla/5.0") {
    return {
      kind: "apple-mpp",
      confidence: appleIp ? 0.95 : 0.8,
      reason: appleIp
        ? "bare 'Mozilla/5.0' user agent from an Apple proxy IP: Apple Mail Privacy Protection prefetch"
        : "bare 'Mozilla/5.0' user agent, the pattern of Apple Mail Privacy Protection prefetches",
    };
  }
  if (appleIp && (agent === "" || /AppleWebKit/i.test(agent))) {
    return { kind: "apple-mpp", confidence: 0.85, reason: "request from an Apple proxy IP range" };
  }
  if (!agent) return { kind: "bot", confidence: 0.7, reason: "no user agent" };
  if (BOT_UA.test(agent)) return { kind: "bot", confidence: 0.9, reason: "user agent of a scanner, crawler or HTTP library" };
  if (delta !== null && delta >= 0 && delta < botSeconds) {
    return { kind: "bot", confidence: 0.75, reason: `opened ${delta.toFixed(1)}s after sending, faster than a person` };
  }
  if (!/Mozilla\/|Outlook|Thunderbird|Microsoft Office|Mail\//i.test(agent)) {
    return { kind: "human", confidence: 0.4, reason: "unrecognised user agent, no automation signal" };
  }
  return { kind: "human", confidence: 0.7, reason: "mail client or browser user agent, no automation signal" };
}

/**
 * Classify a click. Security gateways (Microsoft Safe Links, Mimecast,
 * Proofpoint, …) often follow every link in a message within seconds of
 * delivery.
 */
export function classifyClick(ev: ClickEvent): Classification<ClickKind> {
  const agent = ua(ev?.userAgent);
  const delta = secondsBetween(ev?.at, ev?.sentAt);
  const botSeconds = typeof ev?.botSeconds === "number" ? ev.botSeconds : 5;
  const burstSeconds = typeof ev?.burstSeconds === "number" ? ev.burstSeconds : 3;
  const burstLinks = typeof ev?.burstLinks === "number" ? ev.burstLinks : 3;

  if (typeof ev?.method === "string" && ev.method.toUpperCase() === "HEAD") {
    return { kind: "bot", confidence: 0.95, reason: "HEAD request (link checker)" };
  }
  if (!agent) return { kind: "bot", confidence: 0.75, reason: "no user agent" };
  if (BOT_UA.test(agent)) return { kind: "bot", confidence: 0.9, reason: "user agent of a scanner, crawler or HTTP library" };

  if (Array.isArray(ev?.recentClicks) && ev.at instanceof Date) {
    const t = ev.at.getTime();
    const urls = new Set<string>();
    if (typeof ev.url === "string") urls.add(ev.url);
    for (const c of ev.recentClicks) {
      if (!c || !(c.at instanceof Date) || typeof c.url !== "string") continue;
      if (Math.abs(c.at.getTime() - t) <= burstSeconds * 1000) urls.add(c.url);
    }
    if (urls.size >= burstLinks) {
      return { kind: "bot", confidence: 0.85, reason: `${urls.size} different links clicked within ${burstSeconds}s (link scanner)` };
    }
  }
  if (delta !== null && delta >= 0 && delta < botSeconds) {
    return { kind: "bot", confidence: 0.7, reason: `clicked ${delta.toFixed(1)}s after sending, faster than a person` };
  }
  return { kind: "human", confidence: 0.8, reason: "browser user agent, no automation signal" };
}
