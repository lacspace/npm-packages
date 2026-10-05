# @lacspace/preeti

Convert **Preeti ⇄ Unicode** for Nepali. Preeti is the legacy font in which Latin keys draw Devanagari glyphs. Old documents, notices and many Nepali Word files store text like `g]kfn`, which renders as नेपाल only in that font.

```ts
import { preetiToUnicode, unicodeToPreeti, convertMixed, looksLikePreeti } from "@lacspace/preeti";

preetiToUnicode("g]kfn ;/sf/sf k|wfgdGqLn] cfly{s ;'wf/sf] 3f]if0ff ug'{eof] .");
// "नेपाल सरकारका प्रधानमन्त्रीले आर्थिक सुधारको घोषणा गर्नुभयो ।"

unicodeToPreeti("निर्माण");    // "lgdf{0f"  (paste into a document set in Preeti)
looksLikePreeti("g]kfn");     // true: offer to convert pasted legacy text

// Lines that mix real English with Preeti (common in text pulled out of PDFs):
convertMixed("Pre-/fli6«o k/LIff af]8{");                 // "Pre-राष्ट्रिय परीक्षा बोर्ड"
convertMixed("SEE @)*@ sf] glthf");                        // "SEE २०८२ को नतिजा"
preetiToUnicode("SEE @)*@ sf] glthf", { keepEnglish: true }); // same as convertMixed
```

## Mixed English + Preeti

`preetiToUnicode()` converts every character, so English inside a Preeti line turns into nonsense (`Pre-` → `एचभ(`).
`convertMixed(text)` (or `preetiToUnicode(text, { keepEnglish: true })`) splits each line into tokens and converts only
the ones that look like Preeti:

- **Kept as English:** common English words (about 2,300, plus government and exam terms such as Board, Notice, Result,
  Grade, Ministry, Municipality) with their plurals and -ed/-ing forms, acronyms (SEE, NEB, PDF), Western numbers and
  dates (2082, 2026-10-05), URLs and emails, contractions (don't) and pairs like BE/BArch.
- **Converted as Preeti:** tokens with Preeti fingerprints: glyph keys inside a word (`/ ; ' [ ] { } | \ ~ «` and the
  high Latin-1 range), digits used as letters (`af]8{`), no English vowel (`glthf`), a short-i `l` before a consonant
  key, `q` without `u`, and mid-word capitals that are half letters (`dGqL`).
- **Ambiguous tokens** (lone digits like `5` = छ, short words like `to` = तय, Preeti numerals like `@)*@`, a lone `.`)
  follow their nearest neighbours.
- `Pre-/fli6«o` is split at the hyphen when the head is English and the tail is Preeti.

Consecutive Preeti tokens are converted together, so a line with no English in it gives exactly what
`preetiToUnicode()` gives. Unicode Devanagari already in the text is left alone. The default `preetiToUnicode()`
behaviour is unchanged.

## What it handles

- **Reordering:**
  - The short i (`l`) is typed before its consonant cluster in Preeti; Unicode stores it after.
  - The reph (`{`) is typed after its syllable; Unicode stores it before.
- **Half letters:** these are capitals (`K` = प्, `:` = स्). A half letter followed by `f` gives the full letter (`If` = क्ष, `0f` = ण).
- **Ra-kaar:** `|`, or `«` after round-bottomed letters (ट्र = `6«`).
- **Keys with their own glyphs:**
  - conjuncts: ज्ञ त्र त्त द्य द्द द्ध श्र;
  - रु / रू;
  - फ / झ / ऊ via the `m` tail.
- **Numbers:** Preeti numerals (`@)*#` = २०८३). Western digits become Preeti numerals so they don't turn into letters.
- **Punctuation:** `-`/`_` are brackets, `=` is the full stop, `<` is the question mark and `.` is the danda.
- **Unknown characters** pass through unchanged.

Glyphs in the Latin-1 / Windows-1252 range (`Ë` ङ्ग, `å` द्व, `ß` द्म, `§` ट्ट, `Ý` ट्ठ, `Ø` ्य …) are read too, including
the 0x80–0x9F glyphs when a PDF extractor emits them as raw control codes.

`looksLikePreeti()` returns false for text that breaks Preeti's key grammar (an `m` tail after a letter that cannot take
it, `<` or `(` right before a letter). That is typical of other legacy fonts (Kantipur, Himali, PCS Nepali …), which
this package does not convert.

Preeti fonts in the wild differ slightly on a few Alt glyphs (`` ` `` `~` `ª` `ç` `«`) and on the `qm`/`Qm` ligatures. Those ligatures are read in the Preeti → Unicode direction only. When writing Preeti, the converter uses the unambiguous forms (`s|`, `St`).

## Changes in 1.1.0

- **Missing glyphs added** (Preeti → Unicode), cross-checked against the open-source Preeti tables in
  nepali-bhasa/ttf-to-unicode, Shuvayatra/preeti, casualsnek/npttf2utf, cimplesid/unicode-preeti-js and
  pranphy/sampadak:
  - conjuncts: `Ë` ङ्ग, `Í` ङ्क, `Î` ङ्ख, `‹` ङ्घ, `å` द्व, `ß` द्म, `¢` द्घ, `›` द्र, `„` ध्र, `§` ट्ट, `Ý` ट्ठ, `¶` ठ्ठ,
    `•` ड्ड, `°` ड्ढ, `Ì` न्न, `Å` हृ, `Ø` ्य;
  - half / full letters: `¡` ज्ञ्, `£` घ्, `¤` झ्, `‰` झ्, `´` झ, `ˆ` फ्, `¥` र्‍;
  - signs: `‘` ॅ, `˜` ऽ, and `8Þ` ड़ / `9Þ` ढ़ (nukta);
  - punctuation: `Ö` =, `Ù` ;, `Ú` ’, `Û` !, `Ü` %, `±` +, `×` ×, `…` ‘, `æ` “, `Æ` ”;
  - the same 0x80–0x9F glyphs when they arrive as C1 control codes (U+0084 …).
  
  So `OlGhlgol/Ë` now gives इन्जिनियरिङ्ग and `åf/f` gives द्वारा.
- **New `convertMixed()`** and `preetiToUnicode(text, { keepEnglish: true })` for lines that mix English and Preeti.
- **`looksLikePreeti()`** now rejects text from other legacy fonts that breaks Preeti's key grammar.
- `©` still passes through unchanged. Some tables read it as an alternate र, but in extracted text it is almost always a
  copyright sign.

## Credits
This package started from the WeNepal app's on-device converter and its test suite: 31 word pairs, round trips and a full paragraph.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0): free for personal and commercial use.
