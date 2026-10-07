/** URL normalisation, scheme allowlists and open-tracker detection. */

export const MAX_URL_LENGTH = 8192;

/**
 * Normalise a decoded attribute value the way the URL parser will see it:
 * tabs and newlines anywhere are removed, leading/trailing C0 controls and
 * spaces are trimmed, NULs dropped.
 */
export function normalizeUrl(v: string): string {
  let s = "";
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13 || c === 0) continue;
    s += v[i];
  }
  let a = 0;
  let b = s.length;
  while (a < b && s.charCodeAt(a) <= 32) a++;
  while (b > a && s.charCodeAt(b - 1) <= 32) b--;
  return s.slice(a, b);
}

/** The lowercased scheme ("https", "javascript"), or "" for a scheme-less URL. */
export function schemeOf(u: string): string {
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(u);
  return m ? m[1]!.toLowerCase() : "";
}

export type HrefResult = { kind: "url"; url: string; external: boolean } | { kind: "anchor"; id: string } | null;

/** Sanitize an `<a href>`: http(s), mailto, tel and in-message anchors only. */
export function sanitizeHref(raw: string): HrefResult {
  let u = normalizeUrl(raw);
  if (!u || u.length > MAX_URL_LENGTH) return null;
  if (u[0] === "#") {
    const id = u.slice(1).replace(/\s+/g, "");
    return id ? { kind: "anchor", id } : null;
  }
  if (u.startsWith("//")) u = "https:" + u;
  const scheme = schemeOf(u);
  if (scheme === "http" || scheme === "https") return { kind: "url", url: u, external: true };
  if (scheme === "mailto" || scheme === "tel") return { kind: "url", url: u, external: false };
  return null;
}

/** True for http(s) and protocol-relative URLs. */
export function isRemote(u: string): boolean {
  if (u.startsWith("//")) return true;
  const s = schemeOf(u);
  return s === "http" || s === "https";
}

const DATA_IMAGE_RE = /^data:image\/(?:png|jpe?g|gif|webp|bmp);base64,[A-Za-z0-9+/=]+$/i;

/** A base64 raster data URI within `maxBytes` (never SVG). Returns the cleaned URI or null. */
export function safeDataImage(u: string, maxBytes: number): string | null {
  if (u.length > maxBytes + 64) return null;
  let s = "";
  for (let i = 0; i < u.length; i++) {
    const c = u.charCodeAt(i);
    if (c > 32) s += u[i];
  }
  if (s.length > maxBytes) return null;
  return DATA_IMAGE_RE.test(s) ? s : null;
}

interface UrlParts {
  host: string;
  path: string;
  query: string;
}

function splitUrl(u: string): UrlParts | null {
  let rest = u;
  const scheme = schemeOf(u);
  if (scheme) rest = rest.slice(scheme.length + 1);
  if (!rest.startsWith("//")) return null;
  rest = rest.slice(2);
  let end = rest.length;
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    if (c === "/" || c === "?" || c === "#" || c === "\\") {
      end = i;
      break;
    }
  }
  let host = rest.slice(0, end).toLowerCase();
  const at = host.lastIndexOf("@");
  if (at !== -1) host = host.slice(at + 1);
  host = host.replace(/:\d*$/, "").replace(/\.$/, "");
  const tail = rest.slice(end);
  const hashAt = tail.indexOf("#");
  const noHash = hashAt === -1 ? tail : tail.slice(0, hashAt);
  const q = noHash.indexOf("?");
  return {
    host,
    path: (q === -1 ? noHash : noHash.slice(0, q)).toLowerCase(),
    query: q === -1 ? "" : noHash.slice(q + 1),
  };
}

/**
 * Hosts whose images are open-tracking beacons. Matched as the host itself or
 * any subdomain of it. Extend per call with `trackerHosts`.
 */
export const TRACKER_HOSTS: readonly string[] = [
  "mailtrack.io",
  "emltrk.com",
  "awstrack.me",
  "mailfoogae.appspot.com",
  "t.yesware.com",
  "app.yesware.com",
  "getnotify.com",
  "bananatag.com",
  "t.signaux.com",
  "t.sidekickopen.com",
  "t.senal.com",
  "track.hubspot.com",
  "pixel.wp.com",
  "bat.bing.com",
  "google-analytics.com",
  "www.google-analytics.com",
  "mixpanel.com",
  "api.mixpanel.com",
  "via.intercom.io",
  "track.customer.io",
  "exct.net",
  "pixel.mathtag.com",
  "pixel.app.returnpath.net",
  "trk.klclick.com",
  "mandrillapp.com",
];

/** Host + path fragments that mark an open-tracking endpoint. */
export const TRACKER_PATHS: readonly string[] = [
  "list-manage.com/track/open",
  "mandrillapp.com/track/open",
  "sendgrid.net/wf/open",
  "sendgrid.net/mpss/o",
  "sparkpostmail.com/q/",
  "facebook.com/tr",
  "google-analytics.com/collect",
  "mixpanel.com/track",
  "/track/open",
  "/wf/open",
  "/e/o/",
  "/email/open",
  "/emails/open",
  "/mail/open",
];

/** Path segments that, on an image, mean "beacon". */
const TRACKER_SEGMENTS = new Set([
  "open", "opens", "opened", "track", "tracking", "tracker", "pixel", "beacon", "trk",
  "o.gif", "open.gif", "open.png", "open.php", "open.aspx", "pixel.gif", "pixel.png", "pixel.php",
  "t.gif", "t.png", "1x1.gif", "1x1.png", "beacon.gif", "track.gif", "track.php", "tracking.gif",
]);

/**
 * True when `url` (an absolute http(s) or protocol-relative URL) looks like an
 * open-tracking beacon: a known tracking host, a known open-tracking path, a
 * beacon-like path segment, or a query carrying 3+ `utm_` parameters.
 */
export function isTrackerUrl(url: string, extraHosts: readonly string[] = []): boolean {
  const p = splitUrl(normalizeUrl(url));
  if (!p || !p.host) return false;
  const hostMatch = (h: string) => p.host === h || p.host.endsWith("." + h);
  for (const h of TRACKER_HOSTS) if (hostMatch(h)) return true;
  for (const h of extraHosts) if (h && hostMatch(h.toLowerCase())) return true;
  const hp = p.host + p.path;
  for (const frag of TRACKER_PATHS) if (hp.includes(frag)) return true;
  for (const seg of p.path.split("/")) if (seg && TRACKER_SEGMENTS.has(seg)) return true;
  if (p.query) {
    let utm = 0;
    for (const kv of p.query.split("&")) if (kv.toLowerCase().startsWith("utm_")) utm++;
    if (utm >= 3) return true;
  }
  return false;
}
