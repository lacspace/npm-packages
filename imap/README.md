# @lacspace/imap

An IMAP4rev1 client for Node with **zero dependencies**: RFC 3501 plus the extensions real servers use. It runs over Node's own `net` and `tls` and is built for webmail backends. It targets Hostinger (Dovecot), Gmail, Outlook / Exchange Online and GoDaddy. The test suite replays those servers' response styles from a scripted fake server, and the live greeting and CAPABILITY responses of Gmail, Hostinger and Outlook parse cleanly.

- The parser streams and counts bytes exactly. Literals (`{n}`, `{n+}`, `~{n}`) are measured in bytes, never characters, and a response can split anywhere across TCP chunks.
- `fetch()` is an async iterable. Each message is yielded as soon as it arrives, and reading pauses when your loop falls behind.
- Login uses `LOGIN`, `AUTHENTICATE PLAIN`, **XOAUTH2** or OAUTHBEARER, with SASL-IR when the server offers it. Passwords containing quotes, backslashes or non-ASCII characters are escaped correctly.
- Mailbox roles: SPECIAL-USE, then Gmail XLIST, then a guess from folder names. The name list includes Exchange names (`Sent Items`, `Deleted Items`, `Junk Email`) and localised ones (`Gesendet`, `Corbeille`, `Отправленные`, `已发送`…).
- IDLE is re-issued every 29 minutes. If the server has no IDLE, the client polls with NOOP. Any other command you send during IDLE pauses it, then IDLE resumes.
- MOVE falls back to COPY + `\Deleted` + UID EXPUNGE. Also supported: COPYUID / APPENDUID, CONDSTORE (`changedSince`, `unchangedSince`), QUOTA, ID, and Gmail labels.
- TLS certificates are **always verified** by default. Credentials **never** appear in logs.

```ts
import { createImapClient } from "@lacspace/imap";

const imap = createImapClient({
  host: "imap.hostinger.com",                       // port 993, TLS by default
  auth: { user: "chandan@lacspace.com", pass: process.env.IMAP_PASS! },
});
await imap.connect();

const boxes = await imap.listMailboxes();
// [{ path: "INBOX", specialUse: "\\Inbox", … }, { path: "Sent", specialUse: "\\Sent", subscribed: true, … }, …]
const sent = boxes.find((b) => b.specialUse === "\\Sent");

const inbox = await imap.select("INBOX");          // { exists, uidValidity, uidNext, highestModseq?, … }

const uids = imap.sortUidsDesc(await imap.search({ unseen: true, since: new Date("2026-10-01") }));

for await (const msg of imap.fetch(uids.slice(0, 50), { envelope: true, flags: true, bodyStructure: true })) {
  console.log(msg.uid, msg.envelope?.from[0]?.address, msg.envelope?.subject); // RFC 2047 already decoded
}

// fetch one text part by partId (from bodyStructure, see @lacspace/mime findTextParts)
const [m] = await imap.fetchAll([uids[0]!], { bodyParts: ["1.1"] });
const raw = m!.parts["1.1"];                          // Uint8Array, still transfer-encoded

await imap.store([uids[0]!], { add: ["\\Seen"] });   // mark seen

// live updates until aborted
const ac = new AbortController();
await imap.idle({ signal: ac.signal, onEvent: (e) => console.log(e.type, e) }); // exists | expunge | fetch | recent | flags

await imap.logout();
```

## Provider settings

| Provider | Host | Port | Auth |
|---|---|---|---|
| Hostinger (Dovecot) | `imap.hostinger.com` | 993 (TLS) | mailbox password |
| Gmail / Google Workspace | `imap.gmail.com` | 993 (TLS) | an [app password](https://myaccount.google.com/apppasswords), or `{ user, accessToken }` (XOAUTH2, scope `https://mail.google.com/`) |
| Outlook / Microsoft 365 | `outlook.office365.com` | 993 (TLS) | **XOAUTH2 only**: `{ user, accessToken }` (the server sends `LOGINDISABLED`) |
| GoDaddy (Workspace Email) | `imap.secureserver.net` | 993 (TLS) | mailbox password |
| Any server on 143 | your host | 143 | `secure: false, starttls: "required"` |

## API

### `createImapClient(options)` returns `ImapClient`

| option | default | notes |
|---|---|---|
| `host` | (required) | |
| `port` | 993, or 143 when `secure: false` | |
| `secure` | `true` | implicit TLS |
| `starttls` | `true` | only applies when `secure: false`. `true` upgrades if the server advertises STARTTLS. `"required"` fails with `ESTARTTLS` when the server doesn't advertise it or refuses. `false` never upgrades. |
| `auth` | (required) | `{ user, pass }` or `{ user, accessToken }` |
| `timeoutMs` | 30000 | covers connect plus greeting, and is the per-command inactivity timeout. On expiry the command rejects, the socket closes and you get `ImapNetworkError` `ETIMEDOUT`. |
| `socketTimeoutMs` | off | closes the socket after this long with no traffic in either direction |
| `tls` | none | `tls.ConnectionOptions`. `servername` defaults to `host`, and verification stays on unless you turn it off here yourself. |
| `logger` | none | `{ debug(msg) }` receives the protocol trace. LOGIN/AUTHENTICATE lines and literal contents are always redacted. |
| `clientId` | none | sent with `ID` after login when the server supports it |

### Connection

- **`connect()`:** sends greeting, optional STARTTLS, authentication, and ID. Capabilities are refreshed after TLS and after login.
- **`logout()`, `close()`**
- **`capability()`:** returns a `Set<string>` of upper-case capability names. The same set is available as `client.capabilities`.
- **`id(info?)`**, **`noop()`**

### Mailboxes

- **`listMailboxes()`:** returns `Mailbox[]` = `{ path, rawPath, name, delimiter, flags, specialUse?, subscribed? }`.
  - `path` is decoded UTF-8; `rawPath` is the modified UTF-7 the server sent.
  - Uses `LIST "" "*" RETURN (SPECIAL-USE SUBSCRIBED)` when the server supports it. Otherwise it uses LIST + XLIST + LSUB, then guesses roles from names.
- **`select(path, { readOnly?, condstore? })`:** returns `{ path, exists, recent, unseen?, uidValidity, uidNext, highestModseq?, flags, permanentFlags, readOnly }`.
  - `unseen` is the *sequence number of the first unseen message* (`[UNSEEN n]`), not a count. Use `status()` to get the count.
- **`status(path, items?)`:** returns `{ messages, unseen, uidNext, uidValidity, recent, highestModseq? }`.
- **`createMailbox`** (returns `{ created }`; `ALREADYEXISTS` gives `false`), **`renameMailbox`**, **`deleteMailbox`**, **`subscribe`**, **`unsubscribe`:** take UTF-8 paths, which are encoded for you.
- **`getQuota(root = "")`, `getQuotaRoot(path)`:** return `[{ root, resources: { STORAGE?: { usage, limit } /* KiB */, MESSAGE?: … } }]`.

### Messages

All of these take `{ uid: true }` by default.

- **`search(criteria)`:** returns a `number[]` of UIDs. Criteria:
  - Flags: `all`, `seen`, `unseen`, `flagged`, `unflagged`, `answered`, `deleted`, `draft`. Setting one to `false` gives its negation.
  - Dates: `since`, `before`, `on`, `sentSince`, `sentBefore`, `sentOn`.
  - Text: `from`, `to`, `cc`, `bcc`, `subject`, `body`, `text`, `header: [[name, value]]`.
  - Other: `uid`, `larger`, `smaller`, `keyword`, `unkeyword`, `modseq`.
  - Combining: `or: [a, b]`, `not`.

  Dates go out as `d-Mon-yyyy` using the UTC calendar date. A non-ASCII string is sent as a literal with `CHARSET UTF-8`.
- **`fetch(range, query)`:** returns an `AsyncIterable<FetchedMessage>`. `range` is a UID list or a sequence-set string such as `"1:*"`. Query options:
  - Message data: `envelope`, `flags`, `internalDate`, `size`, `bodyStructure`.
  - `headers`: `true` for the whole header, or an array of field names.
  - `bodyParts`: section names such as `["TEXT", "1", "1.2", "1.MIME"]`.
  - `source`: the whole message.
  - `peek`: default `true`, which uses BODY.PEEK so `\Seen` is not set.
  - `maxPartBytes`: partial fetch, sent as `<0.N>`.
  - `changedSince`: CONDSTORE.
  - `modseq`.
  - `gmLabels`: Gmail `X-GM-LABELS`, returned as `labels`.

  `FetchedMessage = { seq, uid, flags?, envelope?, internalDate?, size?, bodyStructure?, headers?, parts, source?, modseq?, labels? }`.

  Unsolicited EXISTS/EXPUNGE/FETCH that arrive in the middle of a command are emitted as events, not mixed into your results. **`fetchAll()`** collects the results into an array.
- **`store(range, { add?, remove?, set? }, { silent = true, unchangedSince? })`:** returns a `Map<uid, flags>`; flags are filled in when `silent: false`. `.modified` lists the UIDs that failed the `unchangedSince` check.
- **`copy(range, dest)`, `move(range, dest)`:** return `{ uidValidity?, sourceUids?, destUids? }` from COPYUID.
  - Without the MOVE extension, `move` does COPY + `+FLAGS \Deleted` + `UID EXPUNGE <range>`, which needs UIDPLUS.
  - ⚠️ Without UIDPLUS, the fallback has to use a plain `EXPUNGE`. That also removes any **other** message in the mailbox already flagged `\Deleted`.
- **`expunge(range?)`:** uses `UID EXPUNGE` when a range is given and the server supports UIDPLUS, otherwise `EXPUNGE`. Returns the expunged sequence numbers.
- **`append(path, raw, { flags?, date? })`:** returns `{ uid?, uidValidity? }` from APPENDUID. Sent as a LITERAL+ when the server supports it; otherwise the client waits for the server's continuation.
- **`idle({ onEvent?, signal?, pollIntervalMs = 60000, refreshMs = 29 min })`:** resolves when the signal aborts.

### Events

`client.on("exists" | "expunge" | "fetch" | "recent" | "flags" | "close" | "error", …)`. `client.mailbox.exists` stays in sync with EXISTS and EXPUNGE. `error` is only emitted when you have a listener for it.

### Errors

All errors extend `ImapError`:

- **`ImapAuthError`:** NO/BAD on LOGIN/AUTHENTICATE (`responseCode` e.g. `AUTHENTICATIONFAILED`), or no usable mechanism.
- **`ImapNetworkError`:** has a `code`: `ETIMEDOUT`, `ECONNREFUSED`, `EBYE`, `ESTARTTLS`, `ECONNCLOSED`, `ENOTCONN`, or a TLS code such as `DEPTH_ZERO_SELF_SIGNED_CERT`.
- **`ImapCommandError`:** NO/BAD with `responseCode`, e.g. `TRYCREATE`, `NONEXISTENT`, `OVERQUOTA`, `ALREADYEXISTS`.
- **`ImapProtocolError`:** a response that can't be parsed; carries `response`.

### Utilities

- `encodeModifiedUtf7` / `decodeModifiedUtf7`
- `parseImapResponse` (the tokenizer) and `ResponseFramer`
- `buildSearch`
- `uidRange([1,2,3,9])` returns `"1:3,9"`
- `sortUidsDesc`, `expandSequenceSet`
- `parseBodyStructure`, `parseEnvelope`, `decodeWords`
- `SPECIAL_USE_NAMES`

## Body structure

`BodyStructureNode` is **the same contract as `@lacspace/mime`**:

- **Part IDs:** a single-part root is `"1"`. A multipart root is `""`, with children `"1"`, `"2"`. A `message/rfc822` at `P` has a `childNode` at `P` if its body is multipart, or at `P.1` if it is a single part.
- **Normalisation:** `type`, `subtype`, `encoding` and `disposition.type` are lowercase. `params` have lowercase keys, with RFC 2231 and RFC 2047 encodings decoded.
- **Kept as sent:** `id` keeps its `<>`. `envelope` is the raw parsed list.

A test runs the same BODYSTRUCTURE strings through both packages and compares the results field by field.

## Pairs with

- **[@lacspace/mime](https://developer.lacspace.com/packages/mime):** `parseMime(source)`, `parseBodyStructure(node)`, `findTextParts(tree)` to choose the text/html partIds to fetch, and `decodePart(bytes, node)` to undo base64 / QP and the charset.
- **[@lacspace/mailer](https://developer.lacspace.com/packages/mailer):** sends over SMTP. Then `append()` the sent copy to the `\Sent` mailbox.

## Security notes

- TLS verification is on by default, and `servername` (SNI) is set to `host`. Only pass `tls: { rejectUnauthorized: false }` for a local test server. For a private CA, use `tls: { ca }`.
- The logger never sees the password, the token or the SASL payload; their lines are logged as `A2 LOGIN ****`. Literal contents such as message bodies are logged only as their length.
- With `secure: false`, use `starttls: "required"`. The client refuses `LOGIN` when the server sends `LOGINDISABLED`.

## Quirks handled

- **Gmail:** `[Gmail]/…` names; XLIST mapping (`\AllMail` → `\All`, `\Spam` → `\Junk`, `\Starred` → `\Flagged`); the XOAUTH2 error challenge, which is answered so the server's `NO` comes back; X-GM-LABELS; `LITERAL-`.
- **Exchange / Outlook:** `LOGINDISABLED` (XOAUTH2 is required); `Inbox` in mixed case is normalised to `INBOX`; folders get roles from their names (`Sent Items`, `Deleted Items`); some setups advertise IDLE but refuse it, and the client falls back to polling; BODY without extension data.
- **Dovecot (Hostinger):** `CAPABILITY` inside the greeting and the login OK; `LIST-EXTENDED` with `RETURN`; `HIGHESTMODSEQ`; `BINARY` `~{n}` literals.

## Limitations

- Commands run one at a time; there is no pipelining. Open a second client to run work in parallel.
- Not implemented yet: COMPRESS=DEFLATE, QRESYNC/VANISHED, NOTIFY, SORT/THREAD, ESEARCH return options and UTF8=ACCEPT `ENABLE`.
- Node only (TCP sockets).

## Licence

[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0): free for personal and commercial use.
