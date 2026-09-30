/**
 * @lacspace/feed-reader — read the feeds you follow.
 *
 * The complement to `@lacspace/rss` (which *writes* feeds): this parses fetched
 * RSS 2.0 / RSS 1.0 (RDF) / Atom / JSON Feed bodies into one shape, discovers the
 * feeds a web page advertises, and scores each source's health so a large source
 * list can prune itself. Robots.txt respect is provided by composing
 * `@lacspace/robots`. Deterministic, isomorphic, zero *network* — you fetch, it
 * reasons. Bring your own fetch (browser `fetch`, Node, or a proxy).
 */

import { isAllowed, parseRobots } from "@lacspace/robots";
import { parseFeed, type ParsedFeed } from "./parse.js";
import { scoreFeedHealth, type FeedHealth, type HealthOptions } from "./health.js";

export { parseFeed, toISO } from "./parse.js";
export type { ParsedFeed, FeedEntry, FeedType, Enclosure } from "./parse.js";
export { discoverFeeds, commonFeedPaths } from "./discover.js";
export type { DiscoveredFeed, DiscoveredType } from "./discover.js";
export { scoreFeedHealth } from "./health.js";
export type { FeedHealth, HealthStatus, HealthOptions, PollRecord } from "./health.js";

// Re-export the robots primitives so a crawler needs one import for "may I fetch this?".
export { parseRobots, isAllowed } from "@lacspace/robots";

/**
 * Is fetching `feedUrl` permitted by this site's robots.txt for `userAgent`?
 * Pass the raw robots.txt body (fetch it once per host). A missing/empty body is
 * treated as "allowed" — the convention when no robots.txt is served.
 */
export function feedFetchAllowed(feedUrl: string, robotsTxt: string | null | undefined, userAgent = "*"): boolean {
  if (!robotsTxt || !robotsTxt.trim()) return true;
  try {
    return isAllowed(feedUrl, parseRobots(robotsTxt), userAgent);
  } catch {
    return true;
  }
}

export interface ReadFeedResult {
  feed: ParsedFeed | null;
  health: FeedHealth | null;
}

/**
 * One call over an already-fetched body: parse it and (when parseable) score its
 * health. Convenience for the common "poll a source, decide if it's worth
 * keeping" loop. Returns nulls rather than throwing on an unparseable body.
 */
export function readFeed(body: string, healthOptions: HealthOptions = {}): ReadFeedResult {
  const feed = parseFeed(body);
  return { feed, health: feed ? scoreFeedHealth(feed, healthOptions) : null };
}
