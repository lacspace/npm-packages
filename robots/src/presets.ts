/**
 * @lacspace/robots — tiny convenience presets.
 *
 * Zero dependencies · isomorphic · fully typed.
 */

import { robots } from "./index";

/** robots.txt that allows every crawler to fetch everything. */
export function allowAll(opts: { sitemap?: string | string[]; host?: string } = {}): string {
  return robots({ groups: [{ userAgent: "*", allow: ["/"] }], sitemap: opts.sitemap, host: opts.host });
}

/**
 * robots.txt that blocks every crawler from everything — for staging / preview.
 * Alias of {@link blockAll} with a name that mirrors {@link allowAll}.
 */
export function disallowAll(): string {
  return robots({ groups: [{ userAgent: "*", disallow: ["/"] }] });
}
