# @lacspace/nepali-typing

Type Nepali in Latin letters and get Devanagari, with a list of candidates per word like a phonetic input method. It's built for search boxes and comment fields. Pure JS with no dependencies, so it is safe for React Native.

```ts
import { suggest, toDevanagari, createTyper, buildLexicon } from "@lacspace/nepali-typing";

suggest("sarkar");        // ["सरकार", "सर्कर", "सरकारी", …]
suggest("kathmandu");     // ["काठमाडौं", …]
suggest("netaharulai");   // ["नेताहरूलाई", …]  (typed case endings)
toDevanagari("NEPSE aaja 20 ankale badhyo");  // "NEPSE आज २० अंकले बढ्यो"
toDevanagari("mero desh nepal ho.");          // "मेरो देश नेपाल हो।"
```

## How it works

1. **Lexicon:** a list of Nepali words, matched through a *loose key* that forgives how people actually romanise. All of these fold into one key:
   - long and short vowels: `aa`/`a`, `ee`/`i`, `oo`/`u`;
   - consonant variants: `sh`/`s`, `w`/`v`/`b`, `ch`/`chh`, `ph`/`f`;
   - the final or medial *a* that Nepali doesn't pronounce;
   - nasals.

   Candidates are ranked by a weighted edit distance plus word frequency. Words that start with what was typed are offered too (autocomplete).
2. **Case endings:** typed endings are split off the word. These include `le`, `lai`, `ko`, `ka`, `ki`, `ma`, `bata`, `sanga`, `dekhi`, `samma` and `haru…`, so "sarkarko" gives सरकारको.
3. **English loanwords:** these are written the Nepali way: facebook → फेसबुक, mobile → मोबाइल, budget → बजेट.
4. **Phonetic engine:** handles words the lexicon doesn't know. ITRANS-style capitals give the retroflex letters: `T Th D Dh N Sh` → `ट ठ ड ढ ण ष` (`DhuNgaa` → ढुण्गा). Its spellings always appear as extra candidates.

The bundled lexicon is small: about 750 entries: frequent words, the 77 districts and news vocabulary. **Feed it your own Nepali text** for real coverage:

```ts
const typer = createTyper({ words: buildLexicon(myPublishedNepaliStories) });
typer.suggest("balen");             // ["बालेन", …] once your stories use it
typer.learn("pani", "पानी");         // the user picked पानी: it ranks first next time
save(typer.exportLearned());         // persist (AsyncStorage / localStorage) and pass back as { learned }
```

## API

- **`suggest(word, { limit = 5, complete = true })`** and **`toDevanagari(text, { digits = true, danda = true, keep })`:** these use the shared default typer.
  - ALL-CAPS words (NEPSE) stay in Latin; `keep` adds brand names.
  - `digits` turns 0–9 into ०–९.
  - `danda` turns a sentence-ending "." into "।".
- **`createTyper({ words, noBase, learned })`:** returns `{ suggest, convert, learn, addWords, exportLearned, size }`.
- **`buildLexicon(texts)`:** returns `{ word: count }`, counting the Devanagari words in your text.
- **`latinKey()` / `devKey()` / `phonetic()`:** the building blocks.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0): free for personal and commercial use.
