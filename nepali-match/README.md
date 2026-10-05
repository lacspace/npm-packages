# @lacspace/nepali-match

Find names and keywords in Nepali and English text the way a Nepali reader would:
- **Spelling variants match:** काठमाडौँ, काठमाडौं and काठमाण्डौ, or चन्द्र and चंद्र.
- **Words with a postposition match:** झापाको is Jhapa and चितवनमा is Chitwan.
- **Different words don't match:** पर्वतारोही (climber) is not Parbat.
- **Short English acronyms are exact-case:** "SEE results" counts, "Come and see" doesn't.

It is pure JS with no dependencies, and it is safe for React Native.

```ts
import { createMatcher, districtTerms, near, normaliseNe } from "@lacspace/nepali-match";

const areas = createMatcher(districtTerms());
areas.ids("चितवनमा बाढी, झापाको मेचीनगरमा पहिरो");   // ["chitwan", "jhapa"]
areas.test("दुई पर्वतारोही बेपत्ता");                  // false
areas.find("काठमाण्डौबाटै आएका")[0];
// { id: "kathmandu", term: "काठमाण्डौ", lang: "ne", index: 0, end: 13, text: "काठमाण्डौबाटै", suffix: "बाटै" }

const exam = ["परीक्षा", "नतिजा", "विज्ञापन", "exam", "result"];
near("लोकसेवा आयोगले निजामती विधेयकमा राय दियो", "लोकसेवा", exam, 60);   // null: not exam news
near("लोकसेवा आयोगको खरिदार परीक्षाको नतिजा", "लोकसेवा", exam, 60);    // { a, b, gap }

createMatcher([{ id: "see", en: "SEE", ne: "एसईई" }]).test("Come and see");   // false
normaliseNe("काठमाडौँ") === normaliseNe("काठमाडौं");                          // true
```

## How matching works

**`normaliseNe(text, { loose?, digits? })`** applies these steps in order:
1. NFC.
2. Chandrabindu → anusvara.
3. A half nasal before a consonant (ङ्, ञ्, ण्, न्, म्) → anusvara.
4. ई/ी → इ/ि and ऊ/ू → उ/ु.
5. Nukta, ZWJ, ZWNJ and soft hyphens are removed.
6. Devanagari digits → ASCII.
7. Whitespace collapses.

`loose: true` also folds श/ष → स, व → ब and ण → न. Latin text is left as it is.

**Nepali terms** match as whole words:
- Nothing may stand before the word except a space or punctuation.
- After the word, a chain of up to three `POSTPOSITIONS` may follow: मा, को, का, की, ले, लाई, बाट, सँग, देखि, सम्म, तिर, भित्र, हरू, मै, बाटै, नै … Anything else after it means it's a different word.
- Turn this off with `postpositions: false`. Add your own with `extraSuffixes`.

**English terms** match as whole words, ignoring case. Exceptions:
- Under the default `caseSensitive: "auto"` rule, an all-caps term of 2–5 letters (SEE, NEB, PSC) must match its case exactly.
- Set `caseSensitive` per term or per matcher to change this.
- An all-caps headline ("COME AND SEE") still matches SEE. Check the case of the surrounding text if your input has shouty headlines.

**Overlaps:** the longest match wins, so "Nawalparasi West" beats "Nawalparasi". Pass `overlaps: true` to keep both.

Every match carries `index`/`end` offsets into the original text (after NFC), so you can highlight or cut it.

## API

- **`createMatcher(terms, options?)`** returns `{ find(text), test(text, id?), ids(text), size }`. Compile it once and reuse it.
  - A term is either a string, or `{ id?, en?, ne?, aliases?, caseSensitive? }`. `en` and `ne` each take one spelling or an array.
- **`findTerms(text, terms, options?)`** and **`contains(text, terms, options?)`** are one-off shortcuts.
- **`near(text, a, b, maxChars | options, sameSentence?)`** returns the closest `{ a, b, gap }` pair of matches within `maxChars` (default 60), in either order, or null.
  - By default both must sit in the same sentence. A sentence ends at । ॥ ? ! or a newline, or at "." before a space.
  - Dotted abbreviations such as ने.क.पा. and U.S. never end a sentence.
- **`sentenceSpans(text)`** returns the sentence boundaries `near` uses.
- **`splitSuffix(word)`**: for example, `"जिल्लाहरूमा"` → `{ stem: "जिल्ला", suffixes: ["हरु", "मा"] }`.
- **`districtTerms()`** returns all 77 districts.
  - **Names and ids:** names come from `@lacspace/nepali-utils`. Ids are slugs such as `"nawalparasi-east"`, and `province` is a number.
  - **Spellings:** each district carries the spellings seen in real copy: Kavre/काभ्रे, Rukum East/रुकुम पूर्व, Kapilbastu, मोरंग/मोरङ…
  - **Case:** English district names are exact-case, so "dang it" is not Dang.
  - **`ambiguous: true`:** marks Parbat, because पर्वत also means "mountain". Confirm it with `near()` or with district/area context before you tag a story.

## Limits

- The matcher is rule-based and does no stemming beyond postpositions. Verb forms and compounds won't match, which is the point.
- Spellings that differ in more than the folded letters (for example गोर्खा and गोरखा) need an alias.

---

Built by [Lacspace](https://lacspace.com). Licensed under the Lacspace Free Licence v1.0 (see LICENSE).
