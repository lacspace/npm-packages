/**
 * @lacspace/track — privacy-respecting open/click tracking for email
 * campaigns. Signed tokens (HMAC-SHA256 via WebCrypto), safe click
 * redirects, HTML injection and open/click classification. Zero
 * dependencies, isomorphic.
 */

import { fromBase64Url } from "./bytes";
import { escapeAttr, findTrackableLinks, insertBeforeBodyEnd, pixelTag } from "./inject";
import { importKey, isHttpUrl, makeToken, recipientId, verifyToken } from "./token";
import type { ClickContext, InjectOptions, TokenCore, TrackContext, Tracker, TrackerOptions } from "./token";

export type { ClickContext, InjectOptions, TrackContext, Tracker, TrackerOptions, VerifiedToken } from "./token";
export { classifyOpen, classifyClick } from "./classify";
export type { Classification, ClickEvent, ClickKind, OpenEvent, OpenKind } from "./classify";
export { findTrackableLinks } from "./inject";
export type { LinkCandidate } from "./inject";

/** A 43-byte transparent 1×1 GIF to serve from your pixel endpoint (Content-Type: image/gif). */
export const PIXEL_GIF: Uint8Array = fromBase64Url("R0lGODlhAQABAIAAAAAAAP___yH5BAEAAAAALAAAAAABAAEAAAICRAEAOw") as Uint8Array;

/**
 * Create a tracker bound to a secret.
 * @throws TypeError if `secret` is missing or shorter than 16 characters (programmer error).
 */
export function createTracker(secret: string, opts: TrackerOptions = {}): Tracker {
  if (typeof secret !== "string" || secret.length < 16) {
    throw new TypeError("@lacspace/track: createTracker needs a secret of at least 16 characters");
  }
  const ttlDays = typeof opts.ttlDays === "number" && opts.ttlDays > 0 && Number.isFinite(opts.ttlDays) ? opts.ttlDays : 180;
  const core: TokenCore = {
    key: importKey(secret),
    ttlSeconds: Math.round(ttlDays * 86400),
    now: typeof opts.now === "function" ? opts.now : () => Date.now(),
  };
  // Surface an unavailable WebCrypto on first use rather than as an unhandled rejection.
  core.key.catch(() => undefined);

  const tracker: Tracker = {
    pixelToken: (ctx: TrackContext) => makeToken(core, 0, ctx),
    clickToken: (ctx: ClickContext) => makeToken(core, 1, ctx, ctx.url),
    verify: (token: string) => verifyToken(core, token),
    async resolveClick(token: string) {
      const v = await verifyToken(core, token);
      if (!v || v.kind !== "click" || typeof v.url !== "string" || !isHttpUrl(v.url)) return null;
      return v.url;
    },
    recipientId: (email: string) => recipientId(core, email),
    async injectHtml(html: string, ctx: TrackContext, baseUrl: string, io: InjectOptions = {}) {
      if (typeof html !== "string") return "";
      const base = String(baseUrl ?? "").replace(/\/+$/, "");
      let out = html;
      if (io.links !== false) {
        const links = findTrackableLinks(html, base, io.unsubscribeUrls ?? []);
        const tokens = await Promise.all(links.map((l) => makeToken(core, 1, ctx, l.url)));
        // Splice from the end so earlier offsets stay valid.
        for (let i = links.length - 1; i >= 0; i--) {
          const l = links[i]!;
          out = out.slice(0, l.start) + escapeAttr(`${base}/c/${tokens[i]}`) + out.slice(l.end);
        }
      }
      if (io.pixel !== false) {
        const t = await makeToken(core, 0, ctx);
        out = insertBeforeBodyEnd(out, pixelTag(`${base}/o/${t}`));
      }
      return out;
    },
  };
  return tracker;
}
