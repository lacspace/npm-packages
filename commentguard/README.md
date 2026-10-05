# @lacspace/commentguard

**Moderate comments in English, romanized Nepali and Devanagari — deterministically.** Scores spam, abuse, hate, doxxing and link-spam, returns an **allow / review / flag / hide** action, detects PII (Nepali phone, email, URLs/shorteners), and suggests FAQ auto-replies. Rules + small, extendable lexicons; a `borderline` flag marks gray-zone comments where you may want an AI second opinion (AI is never called here).

```bash
npm i @lacspace/commentguard
```

```ts
import { moderate } from "@lacspace/commentguard";

moderate("Join telegram group bit.ly/x, subscribe my channel").action;   // "hide" (link-spam)
moderate("his number is 9812345678 call him").categories.doxxing;         // > 0.6, pii.phones
moderate("great report, thank you!").action;                              // "allow"

moderate("where can I read the full story?", {
  faqs: [{ match: ["where", "kaha", "कहाँ"], reply: { en: "Link in bio.", ne: "बायोको लिंकमा।" } }],
  lang: "en",
}).suggestedReply;  // "Link in bio."  (suggested only for clean comments)
```

## Why

Hand-moderating a Nepali comment section — mixing Devanagari, romanized Nepali and English, plus phone-number doxxing and link-spam — doesn't scale, and sending every comment to an LLM is expensive. `commentguard` triages deterministically and only flags the genuinely ambiguous ones for review.

## API

- **`moderate(comment, options?)`** → `{ action, categories, score, reasons, borderline, suggestedReply?, pii }`.
  - **categories**: 0–1 severity for `spam | abuse | hate | doxxing | linkspam`; `score` is the max.
  - **action** by thresholds (`review` 0.4 / `flag` 0.6 / `hide` 0.85 by default, overridable).
  - **pii**: `{ phones, emails, urls }` (for redaction / doxxing handling).
  - **borderline**: in the gray zone → a good case to ask your AI.
  - **suggestedReply**: an FAQ reply, **only** when the comment is clean (spam/abuse is never rewarded with a reply).
- **options**: `lexicons` (extra terms per category, merged with the starters), `faqs` (`{ match, reply }` rules), `lang`, `thresholds`.
- **`describe()`** → machine-readable command schema for an AI "conductor".
- **`LEXICONS` / `PATTERNS`** exported so you can inspect or build on them.

The bundled lexicons are compact starters — **extend `lexicons` for your community**; the engine, categories, PII detection and actions are the durable part. Normalization lowercases and collapses elongations ("sooo"→"soo") and matches Latin, romanized-Nepali and Devanagari.

## `check()`: strict filter for live comments (1.1.0)

`moderate()` triages into allow / review / flag / hide. `check()` is the strict, whole-word gate a news site runs before a comment goes live:

```ts
import { check } from "@lacspace/commentguard";

check({ text: "muji neta haru", lang: "ne" });
// { ok: false, code: "abuse", review: false, hits: [{ code: "abuse", term: "muji", severity: "high" }] }

check({ text: "call me 9841234567" });                     // { ok: false, code: "personal", … }
check({ text: "join https://t.me/freesignals" });           // { ok: false, code: "spam", … }
check({ text: "Government must resign now", userHistory }); // { ok: false, code: "repeat", … } if they said it already
check({ text: "these leaders are chor" });                  // { ok: true, review: true, … }  mild words only ask for review
```

- **`abuse`:** profanity and slurs in English, Nepali Devanagari (with case endings: मुजीको, हरामीहरू) and romanised Nepali. Leetspeak and masked spellings are caught too (f*ck, sh!t, F U C K, m.u.j.i). Matching is on whole words, so "class", "Putin", "Kami Rita", "चोरी", "गेडागुडी", "मुला" and "dal bhat" pass.
- **`personal`:** personal details:
  - Nepal mobiles (96x/97x/98x, with or without +977 and separators) and landlines (01-4XXXXXX), plus other +CC numbers;
  - emails;
  - citizenship numbers (27-01-71-12345, or "नागरिकता नं. …"), NID, passport and account numbers;
  - Devanagari digits are read too.
- **`spam`:**
  - chat invites and shorteners (t.me, wa.me, bit.ly…), or more than `maxLinks` links (your `ownDomains` never count);
  - promo phrasing ("earn Rs 5000 daily", "DM me", "join telegram");
  - crypto or betting words, which only block next to a link, a contact or promo. "Is crypto betting legal in Nepal?" just asks for review.
- **`repeat`:** the same comment again from `userHistory` (≥ 0.9 similar), or character, word or emoji floods.

Options:
- **`strict`:** mild words block too.
- **`extraAbuse` / `allow`:** your own word lists.
- **`maxLinks`**, **`ownDomains`** and **`repeatSimilarity`**.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
