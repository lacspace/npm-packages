# @lacspace/patterns

Rule-based chart-pattern detection on OHLCV bars, with no AI. Every detector works from **ATR-sized swings**, so the same settings suit a 5-minute chart and a weekly one. Results come back drawing-ready (`paths`, `zones`, `profiles`, using bar indices and prices) and as plain data (`hits`, `found`).

The patterns describe geometry already on the chart; they are not forecasts or advice. An Elliott count in particular is subjective: this shows one count that obeys the rules.

```ts
import { swings, chartPatterns, harmonics, elliott, tpoProfiles } from "@lacspace/patterns";

// bars: { time (unix seconds), open, high, low, close, volume }[]
swings(bars, 2);                // { piv: [{ i, p, hi }], tail, atr }: zigzag confirmed at k × ATR(14)
chartPatterns(bars).found;      // ["Double bottom", "Double bottom", "Range (rectangle)"]
harmonics(bars).hits;           // [{ name: "Gartley", bull, pts: [X,A,B,C,D], forming }]
elliott(bars).paths;            // labelled impulse (0)…(5), then (a)(b)(c); wave-5 target zone
tpoProfiles(bars, 24, 5);       // market profile per session: rows with letters, POC, 70% value area, initial balance
```

| Function | Finds |
|---|---|
| `swings(bars, k = 2)` | Alternating swing highs and lows, confirmed once price moves `k × ATR(14)`. The still-forming extreme is returned as `tail`. |
| `harmonics(bars, k, tolPct = 6, show = 3)` | Gartley, Bat, Alt Bat, Butterfly, Crab, Deep Crab, Cypher and AB=CD. A pattern still waiting for D gets a potential-reversal **D zone**. |
| `elliott(bars, k)` | The latest five-wave impulse obeying the three hard rules (wave 2 doesn't retrace past wave 1's start, wave 3 isn't the shortest, wave 4 doesn't overlap wave 1), then a-b-c. A wave-5 target zone is added when waves 1–4 are in place. |
| `chartPatterns(bars, k = 1.5, look = 200, …, show = 2)` | Double tops and bottoms, head & shoulders (and inverse) with necklines, confirmation and measured moves. Also the latest structure: ascending, descending or symmetrical triangle, rising or falling wedge, range, rising or falling channel, or broadening formation. |
| `tpoProfiles(bars, rows, sessions)` | TPO market profile per session: 30-minute letters (hourly letters on hourly bars), POC, value area, initial balance. |
| `sessionVolumeProfiles(bars, rows, sessions)` | Volume-by-price per session, with up and down volume, POC and value area. |
| `kagi(bars, rev)`, `pointFigure(bars, box, rev = 3)` | Time-independent chart transforms. They return ordinary bars plus the shape data. |

Sessions are split by UTC calendar day. That fits exchanges whose trading day doesn't cross UTC midnight; NEPSE's 11:00–15:00 NPT is 05:15–09:15 UTC. Colours are optional trailing parameters.

Watch out for unadjusted corporate-action gaps (bonus or rights issues) in the input. The detectors treat them as real price moves, so adjust your candles first (for example with `@lacspace/market`).

Contributed by the ShareRocketPro team from their production chart. The tests pin its behaviour on a real NABIL 15-minute snapshot.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0): free for personal and commercial use.
