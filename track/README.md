# @lacspace/track

Open and click tracking for email campaigns, built to collect as little as possible. It gives you:
- **signed tokens** for an open pixel and for click redirects (HMAC-SHA256 via WebCrypto, compact base64url, with an expiry);
- **safe click redirects**: the destination URL is inside the signed token, so your `/c/:token` endpoint can only send people to URLs you signed. It can't be used as an open redirect;
- **`injectHtml`**, which adds a 1×1 pixel and rewrites `http(s)` links in a campaign's HTML while leaving every other byte alone;
- **`classifyOpen` / `classifyClick`**, heuristics that separate people from Apple Mail Privacy Protection, image proxies and security scanners.

It has no dependencies and runs anywhere with WebCrypto (`globalThis.crypto.subtle`): Node 18+, Deno, Bun, workers and browsers. Because WebCrypto is async, the token functions return Promises.

## Read this first: what tracking can and can't tell you

- **Open rates are unreliable.** Since Apple Mail Privacy Protection (MPP), Apple's servers download remote images for many Apple Mail users whether or not they read the message. Image proxies (Gmail, Yahoo) and corporate security scanners also load pixels. A pixel load is a weak signal.
- **Treat clicks and replies as the real signals.** A human click (after filtering scanners with `classifyClick`) or a reply tells you far more than an open.
- **Disclose tracking.** If you track opens or clicks, say so in the sender's privacy policy, and follow the consent rules that apply to your recipients.

## Example

```ts
import { createTracker, classifyOpen, classifyClick, PIXEL_GIF } from "@lacspace/track";

const tracker = createTracker(process.env.TRACK_SECRET!, { ttlDays: 180 });

// When sending
const html = await tracker.injectHtml(campaignHtml, {
  campaignId: "dashain-2026",
  recipient: "sita@example.com",
  messageId: "<a1b2@mail.lacspace.com>",
}, "https://t.lacspace.com", { unsubscribeUrls: ["https://lists.lacspace.com/u/9f8e"] });

// GET /o/:token  (open pixel)
const open = await tracker.verify(token);           // null if forged, tampered or expired
if (open?.kind === "open") {
  const c = classifyOpen({ userAgent: req.headers["user-agent"], ip, at: new Date(), sentAt });
  // record { ...open, ...c }
}
// always answer with the GIF, even for bad tokens
res.type("image/gif").send(PIXEL_GIF);

// GET /c/:token  (click redirect)
const url = await tracker.resolveClick(token);      // only a signed http(s) URL, else null
if (!url) return res.status(404).end();
res.redirect(302, url);
```

## What a token contains

A token holds:
- a version byte and the kind (open or click);
- the issue time, in seconds;
- `campaignId` and `messageId`;
- a **keyed digest of the recipient**;
- the destination URL (click tokens only);
- an HMAC-SHA256 tag, truncated to 128 bits.

It is encoded as unpadded base64url. A pixel token with short ids is under 60 characters.

**The recipient is not stored in clear.** The token carries `HMAC-SHA256(secret, "lacspace-track/rcpt\0" + lowercased trimmed address)`, truncated to 96 bits. Someone who sees a forwarded email's links can't read the address, and without the secret they can't test guesses against it. `verify()` returns that digest as `recipient`. To match it to your list, store `await tracker.recipientId(email)` next to each recipient, or compute it at lookup time. The digest is the same for every campaign. If you need an unlinkable value per campaign, put a per-campaign value in `campaignId` and link it to recipients in your own database.

`campaignId`, `messageId` and click URLs are signed but **not encrypted**. Anyone holding the token can base64-decode them. Don't put secrets in them.

Verification compares the tag in constant time. A token stops verifying `ttlDays` after it was issued (default 180), or if it claims to be issued more than 5 minutes in the future. Changing the secret invalidates every outstanding token.

## `injectHtml(html, ctx, baseUrl, opts?)`

- **Pixel:** `<img src="{baseUrl}/o/{token}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />` goes just before the last `</body>`, or at the end if there is no `</body>`.
- **Links:** the `href` of `<a>` tags pointing at `http://` or `https://` becomes `{baseUrl}/c/{token}`. Quoted and unquoted `href`s both work. `&amp;` and other entities are decoded before the URL is signed.
- **Left untouched:**
  - `mailto:`, `tel:`, `#anchor`, relative and `javascript:` links;
  - links whose href or visible text contains "unsubscribe" or "opt-out";
  - links with a `data-no-track` attribute;
  - URLs listed in `opts.unsubscribeUrls` (pass your List-Unsubscribe https URLs here);
  - template placeholders (`{{…}}`, `{% … %}`, `*|…|*`);
  - links already pointing at `{baseUrl}/c/`;
  - anything inside HTML comments (including Outlook conditional comments), `<script>` or `<style>`.
- **Nothing else changes.** Only rewritten `href` values and the inserted `<img>` differ from the input. Whitespace, attribute order, other attributes and line endings are kept.
- **Options:** `pixel: false` adds no pixel and `links: false` rewrites no links. If `html` is not a string, you get `""`.

`findTrackableLinks(html, baseUrl, unsubscribeUrls?)` returns the links that would be rewritten, as `{ start, end, url }`.

## Classifying events

`classifyOpen({ userAgent, ip?, at, sentAt, isAppleProxyIp?, botSeconds? })` returns `{ kind, confidence, reason }`.

| kind | When |
|---|---|
| `apple-mpp` | The user agent is exactly `Mozilla/5.0`, the pattern Apple's MPP prefetch requests are widely observed to use. Confidence goes up if your `isAppleProxyIp(ip)` returns true. |
| `proxy` | `GoogleImageProxy` (Gmail) or `YahooMailProxy`. Gmail generally fetches images when the message is opened, so the **first** proxy load for a message is likely a real open. Later loads may be served from Google's cache and never reach you. |
| `bot` | No user agent; a scanner, crawler or HTTP-library user agent (Mimecast, Proofpoint, Barracuda, curl, python-requests, headless browsers and others); or a load within `botSeconds` (default 2) of sending. |
| `human` | Everything else. Confidence is 0.7 for a recognisable mail-client or browser user agent, and 0.4 for an unknown one. |

No list of Apple IP ranges ships with this package: Apple publishes its egress ranges and they change. If you want that signal, load the list yourself and pass `isAppleProxyIp`.

`classifyClick({ userAgent, ip?, at, sentAt, method?, url?, recentClicks?, botSeconds?, burstSeconds?, burstLinks? })` returns `{ kind: "human" | "bot", confidence, reason }`. It reports `bot` for:
- `HEAD` requests;
- a missing user agent, or a scanner or library user agent;
- a click within `botSeconds` (default 5) of sending;
- a burst: `burstLinks` (default 3) different links from the same message clicked within `burstSeconds` (default 3) of each other. Link-scanning gateways behave like this.

A common pattern is to still redirect bots, but leave them out of reports.

## API

- `createTracker(secret, { ttlDays?, now? })` returns a `Tracker`. It throws `TypeError` if `secret` is missing or shorter than 16 characters; use 32 or more random bytes.
  - `pixelToken(ctx)` and `clickToken({ ...ctx, url })` return `Promise<string>`.
  - `verify(token)` returns `Promise<{ kind, campaignId, messageId, recipient, issuedAt, expiresAt, url? } | null>`. It never throws on bad input.
  - `resolveClick(token)` returns `Promise<string | null>`: the destination of a valid click token, if it is http(s).
  - `unsubscribeToken(ctx)` / `verifyUnsubscribe(token)` (1.1.0): signed unsubscribe tokens for `{base}/u/{token}` and List-Unsubscribe URLs. They only verify as kind `"unsubscribe"`, live `unsubscribeTtlDays` (default 3650) because unsubscribe links must keep working long after the send, and carry the recipient as a digest: store `recipientId(email)` with the send so you know which address to suppress.
  - `recipientId(email)` returns `Promise<string>`: the recipient digest.
  - `injectHtml(html, ctx, baseUrl, opts?)` returns `Promise<string>`.
- `classifyOpen(event)` and `classifyClick(event)` are described above.
- `findTrackableLinks(html, baseUrl, unsubscribeUrls?)`.
- `PIXEL_GIF`: a 43-byte transparent GIF, as a `Uint8Array`.

## Limits

- The HTML handling is a careful scanner, not a full HTML parser. It handles real-world campaign HTML, but very malformed markup (an unclosed quote inside a tag, for example) may leave some links untouched.
- All classification is heuristic. User agents can be faked, MPP behaviour can change, and scanners that run a full browser late after delivery will look human.
- Tokens are signed, not encrypted (see above).
- No storage, rate limiting or bot blocking is included. Those belong in your endpoints.

Built by [Lacspace](https://lacspace.com). Licensed under the Lacspace Free Licence v1.0 (see LICENSE).
