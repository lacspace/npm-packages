# @lacspace/mail-sanitize

Makes email HTML safe to render inside a webmail. It is the sanitizer behind Lacspace Mail. What it does:
- keeps an allowlist of tags and attributes;
- filters URL schemes, after decoding entity, tab and case tricks;
- swaps remote images for placeholders, so you can add a "Load images" button;
- removes tracking pixels and lists them;
- maps `cid:` images to your attachment URLs;
- scopes `<style>` rules to your message container;
- prefixes ids and classes, so a message can't clobber your DOM or reuse your app's CSS.

It has no dependencies and no DOM. It runs in Node 18+, edge runtimes and the browser, using a hand-written linear-time tokenizer.

```ts
import { sanitizeEmailHtml, htmlToText, textToHtml, snippet } from "@lacspace/mail-sanitize";

const r = sanitizeEmailHtml(message.html, {
  cidMap: { "image001.png@01D9A1B2.3C4D5E60": "/api/messages/42/parts/2" },
});
// r.html            safe markup, with one scoped <style> first
// r.blockedCount    3 remote images replaced by placeholders
// r.hasRemoteContent true → show the "Load images" bar
// r.trackers        ["https://…list-manage.com/track/open.php?u=…"]
// r.links           [{ href: "https://…", text: "Read more" }]

snippet(message.html);                     // "Hello Asha, here is what is new this month — three…"
textToHtml(message.text);                  // escaped, <br>, linkified, "> " lines in <blockquote>
```

## Render it in a webmail

```html
<div class="mail-body" style="position:relative; overflow:hidden; isolation:isolate; contain:content">
  <!-- r.html -->
</div>
```

**The sanitizer is one layer of defence, not the whole of it.** For the strongest setup, also render the message inside a sandboxed iframe with a strict CSP:

```html
<iframe sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer"
        srcdoc="<!doctype html><meta http-equiv='Content-Security-Policy'
          content=&quot;default-src 'none'; img-src data: https://img-proxy.example.com; style-src 'unsafe-inline'; font-src https://img-proxy.example.com&quot;>
          <div class='mail-body'>…r.html…</div>"></iframe>
```

- Leave out `allow-scripts` and `allow-same-origin`. Then the frame can't run script or reach your app, even if a bypass is ever found.
- `img-src` should list only `data:`, your attachment origin and your image proxy. Remote images then can't load directly, even through a CSS path the sanitizer misses.
- Serve the app itself with a CSP that forbids inline script.

## Options

| Option | Default | |
|---|---|---|
| `blockRemoteContent` | `true` | Replace remote `http(s)` images, `background=` and CSS `url()`s with placeholders |
| `cidMap` | `{}` | Content-ID → URL your app serves. Keys go without `<>` or `cid:`. Unknown cids get the placeholder |
| `scope` | `".mail-body"` | Selector every `<style>` rule is prefixed with |
| `linkTarget` | `"_blank"` | `target` for http(s) links (`""` omits it) |
| `allowDataImages` | `true` | Keep `data:image/(png\|jpeg\|gif\|webp\|bmp);base64`. SVG is never kept |
| `maxDataUriBytes` | 2 MB | Largest data URI kept |
| `placeholderSrc` | 1×1 transparent GIF | `src` for blocked, unknown-cid or invalid images |
| `proxyUrl` | none | `(url) => string`. When remote content is allowed, remote image and CSS URLs are rewritten through it |
| `prefix` | `"m-"` | Prefix for message `id`, `name`, `class` and `@keyframes` names. `#anchor` links and `<style>` selectors are rewritten to match |
| `trackerHosts` | `[]` | Extra tracker hosts, matched along with their subdomains |
| `maxDepth` | `100` | Deepest nesting kept. Deeper start tags are flattened and their text is kept |
| `maxLength` | none | Input characters processed |

The result is `{ html, blockedCount, hasRemoteContent, remoteUrls, trackers, removedTags, links }`:
- `removedTags` counts dropped elements by name, with `#comment` for comments.
- `remoteUrls` and `trackers` hold unique URLs in their original form.

## What's removed

- **Tags.** Anything not on the allowlist (`ALLOWED_TAGS`): text formatting, headings, lists, tables, `img`, `a`, `font`, `center`, `div`/`span`/`p`, `blockquote`, `pre`, `figure`, `picture` without `source`, and `details`. Dropped tags fall into three groups:
  - **Removed with their content:** `script`, `style` (its CSS is sanitized and hoisted), `title`, `textarea`, `iframe`, `noscript`, `noembed`, `noframes`, `xmp`, `plaintext`, `template`, `svg`, `math`, `object`, `applet`, `video`, `audio`, `select`, `canvas`, `map`, `xml`.
  - **Unwrapped, keeping their text:** unknown and namespaced tags (`o:p`), `form`, `button`, `label`.
  - **Removed outright:** `meta`, `base`, `link`, `input` and `embed`.
- **Not markup in the output:** comments (including Outlook `<!--[if mso]>` blocks), doctype, CDATA and processing instructions never appear.
- **Attributes.** Only a per-tag allowlist is kept: `href`, `src`, `alt`, `title`, `width`, `height`, `align`, `valign`, `bgcolor`, `color`, `border`, `cellpadding`, `cellspacing`, `colspan`, `rowspan`, `dir`, `lang`, `class`, `style`, `face`, `size`, `start`, `type`, `background`, `summary` and a few others. Presentational values are checked against simple patterns. Everything else is dropped: all `on*`, `srcset`, `formaction`, `xmlns`, `usemap`, the sender's `target`/`rel`, and all `data-*` (so a message can't plant its own `data-lac-src`). `id` and `name` are prefixed, and classes are prefixed too, so `class="fixed inset-0"` can't use your app's utility CSS.
- **Links.** `href` keeps only `http:`, `https:`, `mailto:`, `tel:` and `#anchors`. Protocol-relative links become `https:`. Relative links are removed, because they would resolve against your app. Before the scheme check, values are decoded:
  - named entities, plus numeric ones with or without `;` and with leading zeros;
  - tabs and newlines inside the URL;
  - control characters around it.

  Every kept link gets `rel="noopener noreferrer nofollow"`, and http(s) links also get `target`.
- **CSS.** Declarations are parsed and filtered:
  - Values with `expression`, `javascript:`, `behavior`, `-moz-binding`, `progid` filters or backslash escapes outside strings are dropped. So is any function outside an allowlist (colours, gradients, `calc`, transforms, filters…), which removes `image-set()`, `attr()`, `element()` and `paint()`.
  - `position: fixed` and `sticky` are dropped. `z-index` is clamped to ±100.
  - `url()` follows the image rules.
- **`<style>` sheets.**
  - Each selector is prefixed with `scope`. `html`, `body` and `:root` map to the scope itself. A selector starting with `~` or `+` (it would reach outside the scope) is dropped, and so is one using `&`.
  - `@media` and `@supports` are scoped recursively. `@keyframes` is kept with prefixed names.
  - `@import`, `@charset`, `@namespace`, `@page`, `@layer` and `@container` are dropped. `@font-face` is dropped while remote content is blocked.
  - The output never contains a literal `<`.
- **Output.** It is always well formed: unclosed tags are closed, implied end tags apply (`p`, `li`, `td`, `tr`…), stray end tags are ignored, and text and attributes are re-escaped. `<body>` becomes a `<div>` that keeps its `bgcolor` and `style`.

## Remote images and the "Load images" button

A blocked image keeps its size and alt text, gets the placeholder as `src`, and keeps the original URL in `data-lac-src` (`DATA_SRC_ATTR`). Blocked `background=` attributes become `data-lac-background` (`DATA_BACKGROUND_ATTR`). Blocked CSS `url()`s become `none`.

The simplest "Load images" button sanitizes again. That covers CSS backgrounds too:

```ts
const safe = sanitizeEmailHtml(html, { blockRemoteContent: !userClickedLoadImages,
  proxyUrl: (u) => `https://img-proxy.example.com/?url=${encodeURIComponent(u)}` });
```

You can also swap the images in place. Route them through your proxy, so the sender sees the proxy's IP instead of the reader's:

```ts
for (const img of container.querySelectorAll("img[data-lac-src]")) {
  img.src = proxy(img.getAttribute("data-lac-src")!);
  img.removeAttribute("data-lac-src");
}
```

## Tracker detection

A remote image is treated as an open-tracking beacon in three cases:
- it is tiny: every declared dimension (attribute or inline style) is 2px or less;
- it is hidden with `display:none`, `visibility:hidden`, `opacity:0` or a zero max size;
- its URL matches the built-in list.

The built-in list (`TRACKER_HOSTS`, `TRACKER_PATHS`, `isTrackerUrl`) covers:
- **Hosts:** Mailtrack, Litmus `emltrk.com`, Amazon SES `awstrack.me`, Streak, Yesware, HubSpot, Intercom, Customer.io, Salesforce `exct.net` and others.
- **Paths:** Mailchimp `list-manage.com/track/open`, SendGrid `/wf/open`, Mandrill and SparkPost open paths, plus generic beacon paths such as `/open`, `/track`, `/pixel`, `/o.gif` and `/e/o/`.
- **Queries:** a URL carrying three or more `utm_` parameters.

Trackers are removed outright and listed in `trackers`, even when remote content is allowed. Images from `cid:` and `data:` can't phone home, so they are never flagged. These are heuristics:
- A beacon at full size on an unknown host gets through as an ordinary blocked remote image.
- A real image on a path like `/pixel/` is removed.

## Text helpers

- **`htmlToText(html, { maxLength?, linkStyle: "inline" | "none" })`:** turns HTML into plain text.
  - Drops head, style, script and hidden content.
  - Blocks become newlines, with paragraphs separated by a blank line. List items get `- `.
  - Links become `text (url)` when the text differs from the URL.
  - Entities are decoded and whitespace collapsed.
- **`textToHtml(text, { linkify = true, linkTarget })`:** turns plain text into safe HTML.
  - Escapes the text and turns newlines into `<br>`.
  - Linkifies `http(s)://`, `www.`, `mailto:` and bare email addresses. Trailing punctuation and unbalanced `)` are left out of links.
  - Groups `>`-quoted lines into nested `<blockquote>`.
- **`snippet(htmlOrText, n = 140)`:** a one-line preview, cut at a word boundary. It returns plain text, so escape it before inserting it as HTML.

## Limitations

- **It is a sanitizer, not a browser.** Tokenizing follows the WHATWG rules that matter for safety: tag and attribute states, raw-text elements, comment endings and bogus comments. It doesn't build the spec's tree:
  - Table foster-parenting and the adoption agency are left to the browser.
  - The output can't change meaning when the browser re-parses it: every emitted token is safe, and no raw-text or foreign-content element (`svg`, `math`) is ever emitted.
  - Visual results on badly broken markup may differ slightly from a full browser parse.
- **Selectors.** Attribute selectors on `class` or `id` (`[class~=x]`) stop matching, because the names are prefixed.
- **Positioning.** `position:absolute` is kept. Give the container `position:relative; overflow:hidden` (as above) so content can't overlay your UI.
- **Images.** `srcset` is dropped, not rewritten. `<picture>` falls back to its `<img>`.
- **Fonts.** While remote content is blocked, web fonts from `@font-face` are dropped and text falls back to system fonts.
- **Defence in depth.** Pair the sanitizer with a sandboxed iframe and a CSP. That is still the recommendation for a webmail.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0): free for personal and commercial use.
