# @lacspace/unsubscribe

Mailing-list unsubscribe for webmail. It covers:
- **RFC 2369** List-* headers: List-Unsubscribe, List-Help, List-Subscribe, List-Post, List-Owner and List-Archive;
- **RFC 2919** List-Id;
- **RFC 8058** one-click unsubscribe, sent as a cookie-less POST behind an SSRF guard.

It has no dependencies and runs anywhere with a global `fetch`: Node 18+, Deno, Bun, workers and browsers.

```ts
import { unsubscribeOptions, oneClickUnsubscribe, parseListUnsubscribe, parseListId } from "@lacspace/unsubscribe";

parseListUnsubscribe(
  "<mailto:leave@news.example.com?subject=unsubscribe>, <https://news.example.com/u/abc>",
  "List-Unsubscribe=One-Click",
);
// { https: ["https://news.example.com/u/abc"], http: [],
//   mailto: [{ to: "leave@news.example.com", subject: "unsubscribe" }], oneClick: true, raw: "…" }

parseListId("Weekly Digest <digest.example.com>"); // { name: "Weekly Digest", id: "digest.example.com" }

unsubscribeOptions(message.headers);
// { method: "one-click", url: "https://news.example.com/u/abc", listId: {…}, listUnsubscribe: {…} }

await oneClickUnsubscribe("https://news.example.com/u/abc"); // { ok: true, status: 200 }
```

## The webmail "Unsubscribe" button

1. **Show the button** when `unsubscribeOptions(headers).method !== "none"`. Label it with `listId.name`, falling back to the sender.
2. **Act on `method`:**

| `method` | What the button does |
|---|---|
| `one-click` | Your **server** calls `oneClickUnsubscribe(url)` and shows "Unsubscribed" when it returns `ok`. No page is opened. |
| `mailto` | Send `mailto` (`{ to, subject, text, cc? }`) from the user's own account through your mailer. |
| `https` | Ask the user to confirm, then open `url` in a new tab with `rel="noopener noreferrer"`. |
| `none` | Hide the button. An insecure `http` link may still be listed in `listUnsubscribe.http`. You can show it with a warning, but never follow it automatically. |

3. **Subscriptions view:** group messages by `listId.id`, then use `parseListHeaders()` for the Help, Archive and Owner links.

**Why mailto ranks above a plain https link:** the order is one-click, then mailto, then https. A mailto unsubscribe goes out without the user visiting anything. A plain https link (one without one-click) opens a web page, and that page may:
- run trackers;
- ask the user to log in;
- push a "confirm" step designed to trick them;
- be a phishing page on a look-alike domain.

One-click is safest of all: it's a fixed POST with no cookies and no page to render.

## Security notes

- **Run one-click from the server.** Browsers block cross-origin POSTs (CORS), and `redirect: "manual"` gives an opaque redirect that can't be followed, so the result would be `http_error`. Sending from the server also hides the user's IP.
- **No cookies.** Every request uses `credentials: "omit"`, `referrerPolicy: "no-referrer"` and `cache: "no-store"`. The body is exactly `List-Unsubscribe=One-Click`, sent as `application/x-www-form-urlencoded`.
- **SSRF guard.** The URL in the header comes from whoever sent the email, so these are refused with `error: "private_host"`:
  - loopback, private, link-local (including `169.254.169.254` cloud metadata), CGNAT, multicast and reserved IPv4;
  - IPv6 `::1`, `::`, ULA `fc00::/7`, link-local `fe80::/10`, and v4-mapped or NAT64 forms of private IPv4;
  - `localhost`, `*.localhost`, `.local`, `.internal`, `.lan`, `.home.arpa` and single-label hosts;
  - any URL with userinfo (`user:pw@`). This one is refused even with `allowPrivateHosts`.

  Odd IP spellings such as `0x7f.1` and `2130706433` are normalised by `URL` before the check.
- **DNS.** Checking the hostname can't catch a public name that resolves to a private IP. Pass `resolveHost: (host) => Promise<string[]>` (for example `dns.promises.lookup(host, { all: true })` mapped to addresses) and every resolved IP is checked too. Even then, DNS rebinding between the check and the connection isn't fully prevented. For strong isolation, use an egress proxy or pin the resolved IP in your HTTP agent.
- **Redirects.** At most 3 redirects are followed, and each target must be https and pass the same checks. RFC 8058 needs the request to stay a POST, so a 301, 302 or 303 is re-sent as a **POST with the same body**. Browsers would switch to GET, and that would turn the unsubscribe into a page visit.
- **Timeouts.** `timeoutMs` (default 10 s) covers the whole redirect chain. A caller `signal` that aborts the request is reported as `error: "timeout", detail: "aborted"`.

## API

- **`parseListUnsubscribe(listUnsubscribe, listUnsubscribePost?)`** returns `{ https, http, mailto, oneClick, raw }`. It handles:
  - `<…>` lists separated by commas;
  - folded headers and whitespace inside brackets;
  - comments;
  - mailto with percent-encoded `subject`, `body`, `cc` and `to`, and several recipients.

  Junk entries are dropped, and only absolute URLs are kept. URLs and mailto entries are deduped. `oneClick` is true only when the Post header is exactly `List-Unsubscribe=One-Click` (case and spaces don't matter) **and** there is an https URL.
- **`oneClickUnsubscribe(url, opts?)`** returns `{ ok, status?, error?, detail? }`. Possible errors are `not_https`, `private_host`, `timeout`, `network` and `http_error`. Only 2xx counts as ok.
  - Options: `fetch`, `timeoutMs`, `userAgent`, `signal`, `allowPrivateHosts`, `resolveHost`, `maxRedirects`.
- **`mailtoUnsubscribe(entry)`** returns `{ to, subject, text, cc? }`. `subject` and `text` both default to `"unsubscribe"`.
- **`parseListId(value)`** returns `{ name?, id }` or `null`. It handles quoted names, RFC 2047 B/Q encoded words, comments, a missing name and a bare id.
- **`unsubscribeOptions(headers)`** returns `{ method, url?, mailto?, listId?, listUnsubscribe }`.
- **`parseListHeaders(headers)`** returns `{ listId, unsubscribe, post, help, subscribe, owner, archive }`. Each is `null` when the header is absent, and `List-Post: NO` gives `post.no === true`.
- **Headers** can be a `Headers`, `Map` or `@lacspace/mime` headers object (anything with `get(name)`), or a plain object. Plain-object keys are matched case-insensitively.
- **Helpers:**
  - `parseListUrls`, `parseMailto`, `isOneClickPost`, `decodeEncodedWords`;
  - `isPrivateHost`, `isPrivateIp`, `isPrivateIPv4`, `isPrivateIPv6`;
  - `getHeader`, `ONE_CLICK_BODY`.

## Limitations

- It doesn't check DKIM. Gmail and Yahoo only honour one-click when the List-Unsubscribe headers are covered by a valid DKIM signature. Verify that before showing one-click as trusted.
- DNS rebinding can't be fully prevented without control over the connection itself (see Security notes).
- Encoded-word decoding is minimal. It uses `TextDecoder`, and charsets the runtime doesn't know fall back to UTF-8.
- Bracketless List-Unsubscribe values, which don't follow the RFC, are split on commas, the same way `@lacspace/mime` does it.
- A successful POST only means the sender accepted the request. Gmail and Yahoo give bulk senders up to 2 days to act on it.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0): free for personal and commercial use.
