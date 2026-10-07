# @lacspace/mime

An **isomorphic** RFC 5322 / RFC 2045–2049 MIME parser and builder, written for the Lacspace Mail webmail (mail.lacspace.com). It does three jobs:
- turns raw mail into fields, bodies, attachments and a part tree;
- turns an IMAP `BODYSTRUCTURE` into the same tree, so you fetch only what you need;
- builds outgoing messages that are safe to send.

It has no dependencies and uses only `TextDecoder`, `TextEncoder` and `Uint8Array`. It runs on Node 18+, edge runtimes and browsers. It pairs with **@lacspace/imap** (fetching) and **@lacspace/mailer** (SMTP sending).

```ts
import { parseMime, buildMime, replyHeaders, parseBodyStructure, findTextParts, listAttachments, decodePart } from "@lacspace/mime";

const mail = parseMime(rawBytesOrString);
mail.from;            // { name: "Rām Bahādur", address: "ram@gmail.com" }
mail.subject;         // "नमस्ते दुनिया"   (RFC 2047, split multibyte joined)
mail.html ?? mail.text;
mail.inline;          // cid images from multipart/related → [{ contentId, content, … }]
mail.attachments;     // [{ partId: "2", filename: "Q3 Report.pdf", size, content: Uint8Array }, …]
mail.listUnsubscribe; // { urls: ["https://…"], mailto: "mailto:…", oneClick: true }

// Lazy webmail: classify from BODYSTRUCTURE, then fetch by partId.
const tree = parseBodyStructure(fetchResult.bodyStructure); // object from @lacspace/imap, or the raw IMAP string
const { text, html } = findTextParts(tree);                 // e.g. html.partId === "1.2"
const body = decodePart(await fetchPart(html.partId), html); // transfer-decoded + charset → string
listAttachments(tree);                                      // [{ partId: "2", filename, size, isInline }, …]

// Reply
const raw = buildMime({ from: "me@lacspace.com", to: mail.from!, text: "Thanks!", ...replyHeaders(mail) });
```

## What it handles

**Parsing:** `parseMime` never throws. Malformed input gives a best-effort result.
- multipart `mixed`, `alternative`, `related`, `report`, `digest` and `signed`. For `signed` you get the signed content, and the signature stays hidden.
- `message/rfc822` forwards. They are parsed recursively and listed as an attachment that carries `.message`. When the outer message has no body, the inner message's text is used.
- base64 (ignores junk and whitespace), quoted-printable (soft breaks, lowercase hex, stray `=`), and 7bit / 8bit / binary.
- RFC 2047 B and Q encoded words. Whitespace between adjacent words is dropped, and a multibyte character split across two words is rejoined.
- RFC 2231 parameters: `filename*=utf-8''…` and `filename*0*=` continuations.
- charsets through `TextDecoder` with an alias map: utf-8, us-ascii, iso-8859-x, windows-125x, koi8-r/u, gbk / gb2312 / gb18030, big5, shift_jis, euc-jp, euc-kr and more. windows-1252 is decoded by hand, because Node treats that label as plain latin1. Unknown charsets fall back to UTF-8, then latin1.
- raw UTF-8 headers (RFC 6532), folded headers, CRLF or LF, preamble and epilogue, a missing final boundary, and a missing or wrong boundary.

**Choosing the body:** inside an `alternative`, the last renderable part wins, and `text/plain` is kept as `text`. Non-root parts of a `related` go to `inline`. `text/calendar` invites and bounce reports come out as attachments.

**Limits:** `parseMime(raw, { maxDepth = 20, maxParts = 500, maxSize })`. When a limit is reached, the result has `truncated: true`.

**Part numbering** follows IMAP (RFC 3501 §6.4.5):
- a single-part root is `"1"`;
- a multipart root is `""`, and its children are `"1"`, `"2"`…;
- a `message/rfc822` part at `P` has a multipart body at `P` (children `P.1`…) or a single-part body at `P.1`.

`parseMime` and `parseBodyStructure` use the same numbering, so a partId from either one can be passed to `BODY.PEEK[…]`.

**Building:** `buildMime` writes:
- CRLF line endings throughout, and base64 wrapped at 76 columns;
- each text part as 7bit, quoted-printable or base64, whichever fits;
- encoded-word subjects and names, and RFC 2231 filenames;
- the structure `mixed(alternative(text, related(html, cid images)), attachments)`, leaving out any level the message doesn't need;
- a generated Message-ID `<random@sender-domain>`, from `crypto.getRandomValues`, or `Math.random` where that is missing.

`bcc` is accepted but is never written as a header. CR or LF in any header value, a bad header name, or a malformed id throws `MimeError`.

## API

- **`parseMime(raw, opts?)` → `ParsedMail`:**
  - fields: `headers`, `from`, `sender`, `replyTo`, `to`, `cc`, `bcc`, `subject`, `date`, `messageId`, `inReplyTo`, `references`;
  - bodies and files: `text`, `html`, `attachments`, `inline`;
  - extras: `priority`, `listUnsubscribe`, and `parts` (the tree, with `headers` and `content` on each part).
- **`parseHeaders(raw)` → `MailHeaders`:** `get(name)` returns the decoded value; `getAll`, `raw`, `rawAll`, `has` and `entries` are also available.
- **`parseAddressList(str)` / `parseAddress` / `formatAddress(a)` / `formatAddressList(list)`:** groups are flattened, and each member keeps its `group` name.
- **`decodeWords(str)` / `encodeWord(str)` / `encodeHeader(str)`**
- **`parseBodyStructure(input)` → `PartNode`:** accepts the raw string, a whole `FETCH` line with `{n}` literals, or a `BodyStructureNode` object.
- **`findTextParts(tree)`** → `{ text?, html? }`; **`listAttachments(tree)`** → `PartNode[]`; **`decodePart(bytes, node)`** → `string` for text parts, `Uint8Array` otherwise.
- **`buildMime(mail)`** → a raw message string.
- **`replyHeaders(original)`** → `{ inReplyTo, references, subject: "Re: …" }`. It never stacks `Re:` or `Aw:` prefixes. **`forwardSubject(s)`** → `"Fwd: …"`.
- **Low-level codecs:** `decodeBase64` / `encodeBase64`, `decodeQuotedPrintable` / `encodeQuotedPrintable`, `decodeCharset`, `normalizeCharset`, `parseHeaderParams`, `parseDate`, `parseMessageIds`, `rfc2822Date`, `wrap76`, `generateMessageId`, `guessContentType`.

**Types:** `ParsedMail`, `Address`, `Attachment`, `PartNode`, `BodyStructureNode` (the shared contract with @lacspace/imap), `BuildMail`, `BuildAttachment`, `ParseOptions` and `ListUnsubscribe`.

## Not included

- S/MIME and PGP decryption or verification. Signed content is shown, and encrypted parts come out as attachments.
- `format=flowed` reflowing.
- uuencode and TNEF (`winmail.dat`) unpacking.
- UTF-7.
- iso-8859-16 where the runtime's `TextDecoder` doesn't support it. It falls back to UTF-8, then latin1.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0): free for personal and commercial use.
