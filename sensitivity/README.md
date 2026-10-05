# @lacspace/sensitivity

A zero-AI first pass for a newsroom's sensitive-story gate, in **Nepali and English**. It tells you whether a story is about an election, a court case, a death, communal tension, an allegation against a named person, a child in harm's way, or a health emergency. It also tells you how sure it is, so you only call the model for the ambiguous cases.

```ts
import { classify } from "@lacspace/sensitivity";

classify({ lang: "en", title: "MP Ansari Highlights Irregularities at National Medical College", text });
// { categories: ["named_individual"], confidence: "certain", hits: [...], scores: {...}, reasons: [] }

classify({ lang: "ne", title: "राष्ट्रपतिद्वारा संघीय संसदको चालू अधिवेशन अन्त्य", text });
// { categories: [], confidence: "certain", ... }  → skip the model

classify({ lang: "en", title: "Supreme Court Orders Strict Enforcement of Plastic Bag Ban", text });
// { categories: ["court"], confidence: "unsure", reasons: ["court: policy ruling or no case/charge words"] }  → ask the model
```

On 200 real stories from a Nepali newsroom, it:
- **Without the model:** settled 76% of the stories.
- **Agreement:** every "certain sensitive" call matched the newsroom's model.
- **Misses:** only one "certain nothing" call disagreed with the model, a critical piece about a minister's attendance.

## How it decides

- **Lexicons:** separate Nepali and English lists for each category. Nepali terms match at a word start with any suffix (अदालत, अदालतमा, अदालतले).
- **False friends:** removed before matching:
  - death overs, deadline, climate justice, "Law, Justice";
  - मुद्दा meaning "issue" (राष्ट्रिय मुद्दा);
  - "N वर्षका लागि" (for N years);
  - postmortem services;
  - a beetle प्रकोप.
- **Position weighting:** the headline counts double and the lead (about 600 characters) counts fully. Text deeper in the page counts at 0.3, because scraped sources often carry sidebar and related-story junk.
- **Minors:** a child word only counts with a harm context (abuse, missing, trafficking, court, death…). Ages under 18 are read from "१४ वर्षीया" or "14-year-old".
- **Allegations:** need a person, either from a role word (मन्त्री, सांसद, व्यवसायी…), a Title Case personal name, or your `entities`.
- **Courts:** a court story about a policy ruling (mandamus, परमादेश, नजिर, legal principle), or one with no case or charge words, stays `unsure`.
- **"certain" sensitive** needs the topic in the headline plus two distinct strong signals.
- **"certain" nothing** means no meaningful hits in the headline or lead.

## Options

`classify(input, { include?, certain?, noise?, leadChars?, maxText?, ignore? })`
- **`include`:** the score at which a category is reported. Default 1.
- **`certain`:** the score at which a category counts as certain. Default 2.
- **`noise`:** the floor below which stray hits are ignored. Default 0.6.
- **`leadChars`:** the length of the lead. Default 600.
- **`ignore`:** categories you don't gate on.

`hits` always lists what matched, with `where` (`title` / `lead` / `text`) and `strength`. Log it to tune the lexicons against your own model's verdicts.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0): free for personal and commercial use.
