# @lacspace/feed-reader

**Read the feeds you follow.** The read-side complement to [`@lacspace/rss`](https://developer.lacspace.com/packages/rss) (which *writes* feeds): parse a fetched RSS 2.0 / RSS 1.0 (RDF) / Atom 1.0 / JSON Feed 1.1 body into one normalized shape, discover the feeds a web page advertises, and score each source's health so a large source list prunes itself. Robots.txt respect via [`@lacspace/robots`](https://developer.lacspace.com/packages/robots). Deterministic, isomorphic, zero third-party dependencies — you fetch, it reasons.

```bash
npm i @lacspace/feed-reader
```

```ts
import { discoverFeeds, readFeed, feedFetchAllowed } from "@lacspace/feed-reader";

// 1. Find the feeds a site advertises (from its HTML).
const feeds = discoverFeeds(html, "https://example.com/");
// → [{ href: "https://example.com/feed.xml", title: "RSS", type: "rss" }, ...]

// 2. Respect robots.txt before fetching (fetch the robots body once per host).
if (feedFetchAllowed(feeds[0].href, robotsTxt, "MyNewsroomBot")) {
  const body = await fetch(feeds[0].href).then((r) => r.text());

  // 3. Parse + score in one call.
  const { feed, health } = readFeed(body);
  // feed.entries → normalized { id, title, link, summary, content, author, published, updated, categories, enclosure }[]
  // health → { score, status, ageHours, postsPerDay, duplicateRatio, spike, reasons, ... }
}
```

## What it does

- **One shape for every format** — `parseFeed(body)` reads RSS 2.0, RSS 1.0 (RDF), Atom 1.0 and JSON Feed 1.1 and returns the same `ParsedFeed`, so the rest of your pipeline never branches on format. Handles namespaced fields (`content:encoded`, `dc:creator`, `dc:date`, `media:content`), CDATA, entity decoding and messy/unclosed markup without throwing. Dates are normalized to ISO-8601.
- **Autodiscovery** — `discoverFeeds(html, baseUrl?)` pulls the `<link rel="alternate">` feeds a page declares and resolves relative URLs; `commonFeedPaths(baseUrl)` gives the conventional guess URLs (`/feed`, `/rss.xml`, `/atom.xml`, …) for sites that advertise none.
- **Feed health** — `scoreFeedHealth(feed, opts)` grades a source `healthy` / `degraded` / `stale` / `broken` from staleness vs its **own** inferred cadence (a weekly blog isn't punished for posting weekly), duplicate/"poisoned" items, sudden volume spikes, missing links/dates, and — with an optional poll `history` — the fetch error rate. Every deduction is listed in `reasons` for an audit log.
- **Robots respect, not reinvented** — `feedFetchAllowed(url, robotsTxt, userAgent)` composes `@lacspace/robots`; `parseRobots` and `isAllowed` are re-exported so a crawler needs one import for "may I fetch this?".
- **Bring your own fetch** — the core is pure and does no network, so it runs the same in a browser, in Node, behind a proxy, or in a test with fixture strings.

## Health scoring

```ts
import { scoreFeedHealth } from "@lacspace/feed-reader";

const health = scoreFeedHealth(feed, {
  now: Date.now(),
  history: [{ at: Date.now() - 3600_000, ok: false }, /* ... recent polls ... */],
  // expectedMaxAgeHours: 48,  // optional; inferred from the feed's own cadence otherwise
  spikeFactor: 5,
});
// {
//   score: 0.42, status: "stale",
//   entries: 20, lastEntryAt: "…", ageHours: 190.4, postsPerDay: 1.0,
//   duplicateRatio: 0, missingLinkRatio: 0, missingDateRatio: 0,
//   errorRate: 0.25, spike: false,
//   reasons: ["stale: 190.4h since last post (expected ≤ 72h)", "25% of recent fetches failed"]
// }
```

Use it to keep a big source list clean: drop `broken` feeds, review `stale` ones, and flag `spike`/high-`duplicateRatio` feeds that may have been mis-generated or hijacked — no human has to open each one.

## Pairs with

- [`@lacspace/rss`](https://developer.lacspace.com/packages/rss) — generate feeds (the write side).
- [`@lacspace/robots`](https://developer.lacspace.com/packages/robots) — build/parse robots.txt (used here for fetch permission).
- [`@lacspace/condense`](https://developer.lacspace.com/packages/condense), [`@lacspace/trend-detect`](https://developer.lacspace.com/packages/trend-detect) — turn the entries you ingest into a token-lean digest and a ranked writer queue.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
