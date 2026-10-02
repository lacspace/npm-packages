# @lacspace/speakable

**Say it right: the spoken-form layer every Nepali/English TTS pipeline is missing.** Rewrites what engines mangle — numbers, Bikram Sambat dates, times, currency, percentages, phone numbers, plates, units, ordinals, acronyms, abbreviations, cross-script names — *before* any engine (edge-tts, Piper, Azure, Google…) sees the text. Then segments it with pauses and rate, emits SSML, estimates word timings, and aligns the engine's own word boundaries back to the **original** text so captions never drift.

```bash
npm i @lacspace/speakable
```

```ts
import { speakable, spokenText, alignWordBoundaries, originalWordTimings } from "@lacspace/speakable";

spokenText("२०८३ असोज १६ गते रु. १ लाख ५० हजार, १५.२% वृद्धि, समय १३:३८, NEPSE २,६५०.१२", { lang: "ne" });
// → "दुई हजार त्रियासी साल असोज सोह्र गते एक लाख पचास हजार रुपैयाँ, पन्ध्र दशमलव दुई प्रतिशत वृद्धि,
//    समय दिउँसो एक बजेर अठतिस मिनेट, नेप्से दुई हजार छ सय पचास दशमलव एक दुई"

spokenText("NEPSE rose 12.5 points (0.47%) on 1 October 2026; call +977-9841234567 by 6:30 PM.", { lang: "en" });
// → "nepsay rose twelve point five points (zero point four seven percent) on the first of October,
//    twenty twenty-six; call plus nine seven seven, nine eight four one, two three, four five, six seven by six thirty p m."

const r = speakable(article, { lang: "ne", voice: "ne-NP-HemkalaNeural", pronunciations: { Lamichhane: { ne: "लामिछाने" } } });
r.ssml                 // <speak><s><prosody rate="-8%">…</prosody></s><break time="400ms"/>…</speak>
r.text                 // plain spoken text for engines without SSML
r.segments             // sentences: { text, orig, pauseAfter, rate, durationMs, words:[{word,startMs,endMs}] }
r.estimatedDurationMs  // before you even call the engine

// After synthesis, feed edge-tts WordBoundary events ({ text, offsetMs, durationMs }) back:
const aligned = alignWordBoundaries(r.tokens, r.segments, events);
originalWordTimings(aligned);  // [{ orig: "रु. १ लाख", startMs: 0, endMs: 880, … }] — caption units in the ORIGINAL text
```

## What it normalises

| input | ne | en |
|---|---|---|
| `२०८३ असोज १६ गते` / `16 Asoj 2083` / `2083-06-16` | दुई हजार त्रियासी साल असोज सोह्र गते | sixteenth of Asoj, two thousand and eighty-three |
| `1 October 2026` / `2026-10-02` | एक अक्टोबर दुई हजार छब्बिस | the first of October, twenty twenty-six |
| `१३:३८` / `6:30 PM` | दिउँसो एक बजेर अठतिस मिनेट / साँझ छ बजेर तीस मिनेट | one thirty-eight / six thirty p m |
| `रु. १ लाख ५० हजार` / `NPR 1,20,000` / `Rs 197.5` | एक लाख पचास हजार रुपैयाँ / … / एक सय सन्तानब्बे रुपैयाँ पचास पैसा | one lakh fifty thousand rupees … |
| `$120 million` | बाह्र करोड डलर | one hundred and twenty million dollars |
| `१.५ लाख` / `२.५ करोड` / `1.3 लाख` | डेढ लाख / अढाई करोड / एक लाख तीस हजार | one lakh fifty thousand … |
| `१५.२%` | पन्ध्र दशमलव दुई प्रतिशत | fifteen point two percent |
| `९८४१२३४५६७` / `01-4412345` | नौ आठ चार एक, दुई तीन, … (digit by digit) | nine eight four one, … |
| `बा १२ प ३४५६` | बा बाह्र प तीन चार पाँच छ | Ba twelve Pa three four five six |
| `१६औँ` / `16th` | सोह्रौँ | sixteenth |
| `25°C`, `5 km`, `200 MW` | पच्चिस डिग्री सेल्सियस, पाँच किलोमिटर, दुई सय मेगावाट | twenty-five degrees Celsius … |
| `NEPSE`, `NRB`, `KMC`, `एनएस`, `UNESCO` | नेप्से, एन आर बी, के एम सी, एन एस, युनेस्को | nepsay, N R B, K M C, … |
| `डा.` `वि.सं.` `Dr.` `Rs.` | डाक्टर, विक्रम संवत्, … | Doctor, Bikram Sambat, … |
| `Sandeep Lamichhane` in Nepali text | सन्दीप लामिछाने (translit) or your override | — |
| `काठमाडौं` in English text | — | Kathmandau (translit) or your override |

Nepali has a unique word for every number 0–99 (`NE_0_99`), Indian scales (हजार/लाख/करोड/अर्ब/खर्ब) and fraction idioms (आधा, डेढ, अढाई, सवा, साढे, पौने) — all built in. English picks western or Indian grouping automatically from context (`लाख`/`crore`/`रु`/`Rs` present → lakh/crore), or set `grouping`.

## Pacing, SSML, timing

- Sentences split on `।`/`.`/`!`/`?` (abbreviations are expanded first, so `डा.` never ends a sentence); blank lines are paragraph pauses.
- Each sentence gets `pauseAfter` (400 ms sentence, 700 ms paragraph, 180 ms at commas/clauses) and a `rate` that drops toward 0.88 as the share of numeric words rises — numbers are read slower, as a newsreader does.
- `ssml` uses `<s>`, `<break>`, `<prosody rate>` (the dialect edge-tts and Azure accept); `text` is the plain fallback.
- Word timings are estimated from syllable counts (`syllables()`), tuned for Nepali (≈125 wpm) and English (≈160 wpm) neural voices; `estimatedDurationMs` lets you budget a video before synthesis.
- `alignWordBoundaries(tokens, segments, events)` snaps the engine's real WordBoundary events onto the spoken words (robust to split/merged words) and maps them to **original** spans; `originalWordTimings()` collapses to one entry per original token for karaoke/burn-in captions.

## Options

`lang` (`"ne" | "en" | "auto"`), `pronunciations` (`{ word: { ne, en } | string }`), `acronyms` (extend the table), `foreignWords` (`"transliterate"` default | `"keep"`), `dateSystem` (`"auto"` → Nepali month or ISO year ≥ 2050 = BS), `dateStyle` (`"british" | "american"`), `grouping`, `voice`, `baseRate`, `wpm`, `sentencePauseMs`, `clausePauseMs`, `paragraphPauseMs`, `numberRate`.

`describe()` returns the command schema for an AI conductor. Zero third-party deps (uses `@lacspace/translit` for cross-script names).

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
