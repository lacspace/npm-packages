# @lacspace/mail-classify

Sorts an email into one of 10 inbox categories and gives it a priority (high, normal or low). It only looks at the sender, recipients, subject, a short preview and, if you pass them, a few headers. It never fetches the body and never calls an AI model, so it is fast, free and runs as soon as a message header arrives. Every result says which rules fired, so you can show users why a message landed where it did.

It has no dependencies and runs anywhere: Node 18+, Deno, Bun, workers and browsers.

```ts
import { classify, CATEGORY_META } from "@lacspace/mail-classify";

const r = classify({
  from: "Raj Patel <raj@partnerco.com>",
  to: ["me@acme.com"],
  subject: "Urgent: can you review the quote?",
  snippet: "Attached is the revised estimate…",
  mailboxAddress: "me@acme.com",
});
// {
//   category: "finance",
//   priority: "high",
//   score: 7,
//   reasons: ["finance:subject", "+2 focused category", "+1 sent directly to me",
//             "+2 urgent words", "+1 question", "+1 finance"]
// }

CATEGORY_META[r.category]; // { label: "Finance", color: "#16a34a", hint: "Invoices, receipts, payments, quotes" }
```

## Categories

`team`, `clients`, `personal`, `finance`, `calendar`, `newsletters`, `notifications`, `recruiting`, `social`, `promotions`.

The first rule that matches wins, in this order:

1. **calendar**: `hasInvite`, a `text/calendar` Content-Type header, `.ics` in the subject or snippet, or a subject starting with Invitation / Accepted / Declined / Tentative / Canceled.
2. **social**: the sender domain is a social network or chat app (LinkedIn, Facebook, Instagram, X, TikTok, YouTube, Slack and others).
3. **finance**: money words in the subject, or in the snippet together with invoice / receipt / payment / paid / refund / billing.
4. **recruiting**: hiring words in the subject, or in the snippet together with resume / CV / application / interview.
5. **promotions**: sale / discount / coupon words in the subject.
6. **newsletters**: `isList` (or a List-Id / List-Unsubscribe header), or digest / newsletter / unsubscribe words.
7. **notifications**: an automated sender (no-reply@, alerts@, support@ …), an `Auto-Submitted` or `Precedence: bulk/list/junk/auto_reply` header, or a known service domain (GitHub, Stripe, Google, AWS …).
8. **team**: the sender shares the mailbox's domain.
9. **personal**: the sender uses a consumer mail domain (Gmail, Yahoo, iCloud, Outlook.com …).
10. **calendar**: meeting / call / webinar words in the subject, from a person.
11. **clients**: everything else.

`FOCUSED` (team, clients, personal, finance, calendar, recruiting) is the set a "Focused" view would show.

## Priority

The score starts at 0:

| Signal | Points |
| --- | --- |
| Focused category | +2 |
| Sent directly to the mailbox (in To) | +1 |
| `knownSender: true` | +2 |
| Urgent words (urgent, ASAP, deadline, action required …) | +2 |
| A `?` in the subject or snippet | +1 |
| Finance | +1 |
| Automated sender/header or list mail | −3 |
| More than 6 To + Cc recipients | −1 |
| Newsletters, promotions or social | −3 |

5 or more is `high`, 0 or less is `low`, anything else is `normal`.

## API

- **`classify(input, options?)`** returns `{ category, priority, score, reasons }`. It never throws.
  - `input.from` (required), `to`, `cc`: a string (`"Name <a@b.com>"`, `"a@b.com"`, or a comma-separated list) or `{ name?, address }`, or an array of these.
  - `subject`, `snippet`, `mailboxAddress`.
  - `isList`, `hasInvite`: booleans. When you leave them out and pass `headers`, List-Id / List-Unsubscribe and a `text/calendar` Content-Type decide them.
  - `knownSender`: true for senders you already trust.
  - `headers`: a plain object (keys matched case-insensitively), a `Map`, or anything with `get(name)` such as Fetch `Headers`.
- **`options`**:
  - `patterns`: replace any pattern. Keys: `freeMail`, `automated`, `noreplyLocal`, `socialDomain`, `notificationDomain`, `finance`, `financeSnippetConfirm`, `calendar`, `calendarSubject`, `calendarIcs`, `recruit`, `recruitSnippetConfirm`, `newsletter`, `promo`, `urgent`, `question`. Non-RegExp values are ignored.
  - `focused`: categories that get +2 (default `FOCUSED`).
  - `highAt` (default 5), `lowAt` (default 0), `manyRecipients` (default 6).
- **`createClassifier(options)`** returns a `classify` with the options bound.
- **Patterns**: `AUTOMATED`, `NOREPLY_LOCAL`, `NOTIF_DOM`, `SOCIAL_DOM`, `FREE_MAIL`, `CALENDAR`, `CALENDAR_SUBJECT`, `CALENDAR_ICS`, `FINANCE`, `FINANCE_SNIPPET_CONFIRM`, `RECRUIT`, `RECRUIT_SNIPPET_CONFIRM`, `NEWSLETTER`, `PROMO`, `URGENT`, `QUESTION`, and `DEFAULT_PATTERNS` with all of them.
- **`CATEGORY_META`**: `{ label, color, hint }` per category. **`categoryMeta(overrides)`** returns a merged copy, for example `categoryMeta({ clients: { label: "Customers" } })`.
- **`CATEGORIES`**, **`FOCUSED`**, **`isCategory(value)`**.
- **Helpers**: `parseAddress`, `splitAddressList`, `getHeader`.

```ts
// Your own service domains count as notifications; rename a category for your UI.
const myClassify = createClassifier({ patterns: { notificationDomain: /(^|\.)(mycrm|myerp)\./i } });
const meta = categoryMeta({ clients: { label: "Customers", color: "#0ea5e9" } });
```

## Limits

- It is a keyword and domain heuristic tuned for English mail. It will misfile some messages; let users override the category and keep their choice.
- It doesn't read the body, attachments or images, and it doesn't check whether the sender is who they claim to be (pair it with SPF/DKIM/DMARC results).
- Domain lists cover common global services. Add your region's banks, wallets and tools through `patterns`.
- "team" compares exact domains, so `a@sub.acme.com` is not team mail for `me@acme.com`.

Built by [Lacspace](https://lacspace.com). Licensed under the Lacspace Free Licence v1.0 (see LICENSE).
