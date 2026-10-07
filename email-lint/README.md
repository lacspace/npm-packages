# @lacspace/email-lint

A pre-send check for email. Before you hit send, it tells you in plain English what is likely to land the message in spam or make it look broken, and how to fix each problem. You get a 0–100 score, a good / fair / poor grade, a list of issues with fixes, and a few stats.

It was built for Lacspace Mail (webmail and campaigns), and works for any app that sends email.

- 41 rules with stable ids: Gmail clipping, attachments, images, links, subject lines, spam-like wording, hidden text, CSS that breaks in Gmail or Outlook, malformed HTML, and the Gmail / Yahoo bulk-sender unsubscribe requirements.
- Messages in English, with Nepali (`locale: "ne"`) for the 10 most important rules.
- `spamPhrases()` on its own, for an AI rewriter or a live "this sounds spammy" hint.
- Zero dependencies (it has its own small, tolerant HTML tokenizer). Runs in Node 18+, Deno, Bun, workers and browsers.

```ts
import { lintEmail } from "@lacspace/email-lint";

const result = lintEmail(
  {
    subject: "Your October product update",
    preheader: "Faster search, calmer inbox, new shortcuts.",
    from: "Lacspace <news@lacspace.com>",
    html: campaignHtml,
    text: campaignText,
    headers: {
      "List-Unsubscribe": "<https://lacspace.com/u/abc>, <mailto:unsub@lacspace.com>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    bulk: true,
  },
  { rules: { "links.http_insecure": "off" } },
);

result.score;  // 92
result.grade;  // "good"
result.issues; // [{ id: "images.missing_alt", severity: "warn", count: 1,
               //    message: "1 image has no alt text, so readers with images off ...",
               //    fix: "Add an alt attribute describing each image. ..." }]
result.stats;  // { sizeBytes, imageCount, linkCount, textToImageRatio, textChars, wordCount }
```

(The numbers above are illustrative; they depend on your message.)

## API

### `lintEmail(input, opts?)` / `lint(input, opts?)`

`lint` is the same function under a shorter name.

**input** (every field is optional):

| Field | Type | |
|---|---|---|
| `html` | `string` | The HTML part. |
| `text` | `string` | The plain-text part. Body rules use it when there is no HTML. |
| `subject` | `string` | Subject rules only run when this is passed. An empty string counts as missing. |
| `preheader` | `string` | Preview text. If you don't pass it, a short hidden block at the top of the HTML is recognised as the preheader. |
| `from` | `string` | e.g. `"News <news@example.com>"`. |
| `headers` | `Record<string, string \| string[]>` | Header names match case-insensitively. |
| `attachments` | `{ filename, size, contentType? }[]` | `size` in bytes. |
| `bulk` | `boolean` | Campaign / bulk mail. Turns on the compliance rules. |

**opts**:

| Option | Type | |
|---|---|---|
| `requireUnsubscribe` | `boolean` | Also turns on bulk mode. Bulk mode is on when either this or `input.bulk` is set. |
| `rules` | `{ [id]: "off" \| "info" \| "warn" \| "error" }` | Turn a rule off or force its severity. Unknown ids are ignored. |
| `locale` | `"en" \| "ne"` | Language of `message` and `fix`. Nepali falls back to English for rules it does not cover. |

**Result**:

- `score`: starts at 100. Each rule that fires subtracts once (error 20, warning 8, info 2), however many times it was found; the number found goes in `count`. Clamped to 0–100.
- `grade`: `"good"` at 80 or more, `"fair"` at 55 or more, otherwise `"poor"`.
- `issues`: `{ id, severity, message, fix?, clients?, count?, sample? }`, errors first, then warnings, then info. `clients` is only set where the affected client is well established.
- `stats`:
  - `sizeBytes`: UTF-8 size of the HTML.
  - `imageCount`: content images; 1x1 and 2x2 tracking pixels are not counted.
  - `linkCount`: links with a real href (or URLs in the text part when there is no HTML).
  - `textToImageRatio`: visible words per image, `wordCount / max(imageCount, 1)`.
  - `textChars`, `wordCount`: visible text only (nothing from `<head>`, `<style>`, `<script>` or hidden elements).

### `spamPhrases(text)`

Returns the spam-like phrases found in `text`, in the casing they were written, without duplicates (case-insensitive), in order of first appearance. Matching is whole-word and tolerates extra spaces and curly apostrophes. Nepali phrases also match with a postposition attached ("अफरमा").

```ts
spamPhrases("ACT NOW and act now! Click Here to claim your prize");
// ["ACT NOW", "Click Here", "claim your prize"]
```

### `RULES`, `SPAM_PHRASES`

`RULES` maps every rule id to `{ severity, description, bulkOnly?, clients?, escalates? }`. `SPAM_PHRASES` is the phrase list (English plus a few Nepali phrases such as "निःशुल्क", "तुरुन्त", "जित्नुभयो", "अफर").

## Rules

"Bulk" rules only run in bulk mode. A severity like "warn → error" means the rule raises a higher severity past a threshold; a `rules` override always wins.

| Id | Default | Why |
|---|---|---|
| `html.too_large` | warn → error | Gmail clips messages with more than about 102KB of HTML behind "View entire message", often hiding the footer and unsubscribe link. Warn above 90KB, error above 102KB (KB = 1024 bytes). Clients: Gmail. |
| `attachment.large` | warn → error | Total attachments over 10MB warn, over 25MB error. Gmail limits a message to 25MB and base64 encoding makes files about a third bigger in transit. |
| `attachment.risky_type` | error | `.exe .js .scr .bat .vbs .jar .iso .docm .xlsm` are commonly blocked or quarantined. |
| `text.missing_plain` | info | HTML with no plain-text part. Some filters treat that as a weak spam signal, and text-only clients show nothing useful. |
| `images.only` | error | Images with fewer than 15 words of text. Blank when images are blocked, and a well-known spam pattern. |
| `images.high_ratio` | warn | Fewer than 40 visible words per image. |
| `images.missing_alt` | warn | No `alt` attribute: nothing shows with images off or in a screen reader. `alt=""` (decorative) is fine. |
| `images.no_dimensions` | info | No width/height (attribute or inline style), so the layout can jump or render at natural size. |
| `links.text_mismatch` | error | The link text shows a URL or domain whose registrable domain differs from the href's. The classic phishing pattern. |
| `links.shortener` | warn | bit.ly, tinyurl, goo.gl, t.co, ow.ly, is.gd, cutt.ly, rebrand.ly hide the destination and are widely abused. |
| `links.ip_address` | error | Links to a raw IPv4 / IPv6 address. |
| `links.http_insecure` | info | `http://` instead of `https://`. |
| `links.too_many` | warn | More than 50 links. |
| `links.javascript` | error | `javascript:` links never run in email and look hostile. |
| `links.empty` | warn | Links with no href, an empty href or `#` (named anchors with no text are ignored). |
| `subject.missing` | warn | Empty subject. |
| `subject.too_long` | warn | More than 78 characters. A display heuristic: most inboxes cut it off earlier. |
| `subject.all_caps` | warn | At least 70% of the subject's cased letters are capitals (6 or more). |
| `subject.excess_punctuation` | warn | `!!`, `??`, `$$` or more, or 3+ exclamation marks. |
| `subject.spammy` | warn | The subject contains a phrase from `SPAM_PHRASES`. |
| `subject.fake_reply` | warn (bulk) | A campaign subject starting with `Re:` / `Fwd:` pretends to be a conversation. |
| `subject.emoji_heavy` | info | Three or more emoji. |
| `body.spammy_phrases` | warn → error | Phrases from `SPAM_PHRASES` in the visible text or preheader. Error at 5 or more different phrases. |
| `body.all_caps_ratio` | warn | A quarter or more of the words are all capitals (at least 8 words with letters). |
| `body.excess_exclamation` | warn | `!!` anywhere, or more than 5 exclamation marks. |
| `body.hidden_text` | warn | Text hidden with `display:none`, `visibility:hidden`, `opacity:0`, `font-size:0`, the `hidden` attribute, or coloured the same as its background. One style-hidden block before any visible text and under 150 characters is treated as the preheader and allowed. |
| `css.script` | error | `<script>` tags or `on*` event handlers. Gmail and all mainstream clients strip them. Clients: Gmail. |
| `css.external_stylesheet` | warn | `<link rel="stylesheet">` is not loaded by Gmail. Clients: Gmail. |
| `css.import` | warn | `@import` is not reliably supported. |
| `css.layout_unsupported` | warn | `position:absolute/fixed`, `display:flex/grid`. Clients: Outlook (Windows). |
| `css.background_image` | info | CSS background images (not the `background` attribute). Clients: Outlook (Windows). |
| `html.form` | warn | `<form>`, `<input>`, `<select>`, `<textarea>` are disabled or stripped by many clients. |
| `html.embed` | warn | `<iframe>`, `<video>`, `<embed>`, `<object>` are stripped or ignored by most clients. |
| `svg.inline` | warn | Inline `<svg>`. Clients: Gmail. |
| `images.base64` | warn | `data:` URIs in `<img>` or CSS. Clients: Gmail. |
| `bulk.no_unsubscribe` | error (bulk) | No `List-Unsubscribe` header and no visible unsubscribe link. |
| `bulk.no_one_click` | warn (bulk) | No RFC 8058 one-click unsubscribe: `List-Unsubscribe` with an https URL plus `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Gmail and Yahoo require it of bulk senders. Also raised when there is a visible link but no header. |
| `bulk.no_postal_address` | info (bulk) | No street address or PO box found (heuristic). Laws such as the US CAN-SPAM Act require one in commercial mail. |
| `from.noreply` | info | A no-reply From address. Readers can't answer. |
| `preheader.missing` | info (bulk) | Bulk HTML with no `preheader` and no hidden preheader block. |
| `html.malformed` | info → warn | Unclosed or stray tags (tags whose end tag HTML allows you to omit, like `<p>`, `<td>`, `<li>`, are not counted). Warn above 3. |

## Limits

- **It is heuristic.** Real spam filters (Gmail, Outlook, Yahoo, SpamAssassin setups) are not public, and they weigh sender reputation, authentication (SPF, DKIM, DMARC), engagement and volume much more than content. A score of 100 does not guarantee the inbox, and a low score does not guarantee spam. Use it to catch mistakes, not to predict placement.
- **It does not render.** It reads the HTML and inline / `<style>` CSS as text. It does not apply stylesheet selectors to elements, so hidden-text and colour checks only see inline styles and `bgcolor` / `<font color>` attributes. It does not take screenshots or test real clients.
- **Domain matching is simplified.** "Registrable domain" uses the last two labels, plus a short built-in list of two-part suffixes such as `co.uk` and `com.np`, not the full Public Suffix List. Click-tracking redirects will show as mismatches when the link text is a URL; that is also what filters see.
- **Postal address detection** looks for street words (street, road, avenue, marg, chowk, tole, ...) with numbers, or a PO box. It will miss some address formats.
- **No network calls.** It does not check DNS, blocklists, link reputation, or whether links resolve.
- The spam phrase list is a judgement call, not a published standard. Context matters: one phrase in an otherwise normal email is unlikely to matter.

Built by [Lacspace](https://lacspace.com). Licensed under the Lacspace Free Licence v1.0 (see LICENSE).
