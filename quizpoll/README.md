# @lacspace/quizpoll

**Quiz and poll items from a news article, English or Nepali, with no LLM** — fill-in-the-blank on figures and names, true/false, opinion polls, did-you-know cards — each with a correct answer index and a per-platform fit.

```bash
npm i @lacspace/quizpoll
```

```ts
import { quizpoll } from "@lacspace/quizpoll";

const q = quizpoll(articleText, { maxQuiz: 4, maxPolls: 2, seed: 42 });
q.quiz[0]
// { kind: "number", question: "खाली ठाउँ भर्नुहोस्: बैंकहरूले कर्जामा लिने ब्याजदर ____ माथि लैजान पाउने छैनन्",
//   options: [{ text: "१३ प्रतिशत" }, { text: "१२ प्रतिशत", correct: true }, { text: "११ प्रतिशत" }, { text: "१४ प्रतिशत" }],
//   answerIndex: 1, explanation: "उत्तर: १२ प्रतिशत", source: "…",
//   fits: { "instagram-poll": false, "instagram-quiz": true, youtube: true, x: true, facebook: true, telegram: true } }
q.polls        // opinion polls from safe templates (no claims): "यसबारे तपाईंको धारणा के छ?" राम्रो निर्णय / गलत निर्णय / थाहा छैन
q.didYouKnow   // "थाहा छ? …" cards from the figure sentences
```

## Item kinds

- **number** — the sentence with the figure blanked out; distractors scale the number **as written**: `१२ प्रतिशत` → `११/१३/१४ प्रतिशत`, `५० अर्ब` → `२५/७५/१०० अर्ब`, `1,20,000` → `60,000/180,000/240,000`, `12.5%` → `6.3/18.8/25.0%`. Digit script, scale words, decimals and separators are preserved.
- **entity**: a name blanked out. Every option has the **same type** as the answer (place↔place, person↔person, org↔org), using `typedEntities()`.
  - **People and organisations:** the other options come from the same article, so they are never invented.
  - **Districts and countries:** the other options are districts or countries that the article does *not* mention. A place the article does mention could also be true.
  - **Never used as options:** sentence-opening words ("According", "Traders"), demonyms ("Sri Lankan"), news-outlet names, and anything that can't be typed.
- **truefalse** — a high-ranked true sentence, and a false statement made by perturbing one figure (answer: False, with the real figure in `explanation`).
- **opinion** — polls from templates (yours via `opinionTemplates` first, then built-ins). No factual claim is made.
- **didyouknow** — figure sentences as cards.

Items are built only from full sentences: ending punctuation, 5+ words, no outlet named. A title line above the body is its own sentence, and `रु.`, `नं.`, `डा.`, `Rs.` and `No.` never end a sentence; both rules come from `@lacspace/extractive` 1.2.2. A wrong figure is never another figure that appears in the article.

Shuffles are deterministic (`seed`, default derived from the text) so re-renders are stable. `fits` applies option limits: Instagram story poll 2, Instagram quiz sticker 4, YouTube community poll 5, X 4, Facebook/Telegram 10.

`describe()` returns the command schema for an AI conductor.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
