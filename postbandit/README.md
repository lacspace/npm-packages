# @lacspace/postbandit

**Learn the best option per platform from real engagement — posting time, format, thumbnail or title variant.** A tiny Thompson-sampling multi-armed bandit: each arm keeps a Beta posterior, `choose()` samples and picks, `update()` folds in a reward. Deterministic when seeded, persistable to JSON. Designed to plug into `@lacspace/postplan`.

```bash
npm i @lacspace/postbandit
```

```ts
import { createBandit } from "@lacspace/postbandit";

const bandit = createBandit(["09:00", "13:00", "19:00"], { seed: 1 });

const slot = bandit.choose();            // which posting time to try next
// …post at `slot`, later measure engagement (0..1)…
bandit.update(slot, 0.42);               // normalized engagement rate

bandit.best();                            // the current winner (exploit)
bandit.stats();                           // [{ id, alpha, beta, pulls, mean }], best first
const state = bandit.toJSON();            // persist; restore with Bandit.fromJSON(state)
```

## Why

A/B-testing post timing/format/variants by hand never converges. A bandit balances exploring new options against exploiting the winner, and improves every time you feed it a result — no model, no tokens.

## API

- **`createBandit(ids?, { priorAlpha?, priorBeta?, seed? })`** — Beta(1,1) priors by default; pass a `seed` for reproducible sampling (tests/replay).
- **`choose()`** → the arm id to try next (Thompson sample). **`rank()`** → all arms ordered by one sample each (for an ordered lineup).
- **`update(id, reward)`** — `reward` in `[0,1]` (booleans map to 1/0). Unknown ids are added on the fly.
- **`stats()`** → `{ id, alpha, beta, pulls, mean }[]` (best mean first). **`best()`** → top arm id.
- **`toJSON()` / `Bandit.fromJSON(state, opts)`** — persist and restore across runs.
- **`describe()`** → machine-readable command schema for an AI "conductor".

Use one bandit per (platform × decision) — e.g. a format bandit whose arms are `video|image|carousel|text`, fed back from `@lacspace/postplan`'s choices and their engagement.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
