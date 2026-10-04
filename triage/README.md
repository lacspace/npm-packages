# @lacspace/triage

Decide which news candidates to **write** before spending a single AI token. Write only what you'll publish, and publish it while it's fresh. Deterministic, with no AI.

```ts
import { triage, roundups } from "@lacspace/triage";

const decisions = triage(candidates, {
  now: Date.now(),
  freshnessHours: { default: 48, weather: 12, nepse: 24 },
  slots: { perHour: { en: 3, ne: 3 }, usedThisHour: { en: 1, ne: 0 } },
  quotas: { sports: 1 },
});
// [{ id, action: "write_now" | "queue" | "drop", priority, reasons, roundup?, independentSources, expiresAt }]

roundups(decisions); // { "nepse-notices": ["bonus-1", "right-2"] }
```

A candidate looks like `{ id, title, lang, category, firstSeenAt, newestKnownAt?, sources: [{ domain, primary?, trust?, at? }], trend?, novelty?, breaking?, kind?: "notice" | "news", allegation? }`.

## Rules

- **Independent sources** are distinct *registrable* domains: two pages from `sebon.gov.np` count once (`www.` and `gov.np`/`co.uk`-style suffixes are handled).
- **Priority** = 0.35 × freshness (linear decay over the category's window) + 0.25 × sources (independent domains / 3, plus a third for an official source) + 0.2 × trend + 0.15 × novelty + 0.05 × trust.
- **Slots:** the free slots per language are filled in priority order, respecting category quotas. The rest are queued.
- **Breaking fast lane:** a candidate flagged `breaking`, or with **≥ 3 independent sources within 60 min plus trend ≥ 0.5**, is written now even when the slots are full (2 per hour by default).
- **Sensitive stories** (politics, courts, crime, death, communal, minors, health emergency, or any `allegation` against a named person) need **≥ 2 independent sources or an official one**. Otherwise they're dropped with `sensitive:needs_2_sources_or_official`.
- **Routine notices** (`kind: "notice"`, bonus/right share registered or approved, AGM/book closure, a court notice board) get priority × 0.5. They're never written alone; they get a `roundup` key so they can be combined.
- **Dropped before any slot is used:** stale items (past the freshness window), duplicates (novelty < 0.3), and queued items that would expire before the next hourly window.

Every decision carries its `reasons`, so the dashboard can show why a story was written, queued or dropped.

Built for WeNepal's newsroom; the tests use their live candidates from 4 Oct 2026.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0): free for personal and commercial use.
