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

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
