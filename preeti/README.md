# @lacspace/preeti

Convert **Preeti ⇄ Unicode** for Nepali. Preeti is the legacy font in which Latin keys draw Devanagari glyphs. Old documents, notices and many Nepali Word files store text like `g]kfn`, which renders as नेपाल only in that font.

```ts
import { preetiToUnicode, unicodeToPreeti, looksLikePreeti } from "@lacspace/preeti";

preetiToUnicode("g]kfn ;/sf/sf k|wfgdGqLn] cfly{s ;'wf/sf] 3f]if0ff ug'{eof] .");
// "नेपाल सरकारका प्रधानमन्त्रीले आर्थिक सुधारको घोषणा गर्नुभयो ।"

unicodeToPreeti("निर्माण");    // "lgdf{0f"  (paste into a document set in Preeti)
looksLikePreeti("g]kfn");     // true: offer to convert pasted legacy text
```

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

Preeti fonts in the wild differ slightly on a few Alt glyphs (`` ` `` `~` `ª` `ç` `«`) and on the `qm`/`Qm` ligatures. Those ligatures are read in the Preeti → Unicode direction only. When writing Preeti, the converter uses the unambiguous forms (`s|`, `St`).

## Credits
This package started from the WeNepal app's on-device converter and its test suite: 31 word pairs, round trips and a full paragraph.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0): free for personal and commercial use.
