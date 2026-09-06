/**
 * A small, dependency-free robots.txt parser and matcher — enough to be a
 * polite citizen. Groups rules by user-agent, applies the most specific
 * matching group, and decides allow/disallow by longest-match (allow wins ties).
 */
import { fetchPage } from "./fetch.js";

interface Group {
  agents: string[];
  rules: { allow: boolean; path: string }[];
}

export interface Robots {
  groups: Group[];
  /** Decide whether `path` may be fetched by `userAgent`. */
  isAllowed(path: string, userAgent?: string): boolean;
}

/** Parse robots.txt text into a matcher. Pure. */
export function parseRobots(text: string): Robots {
  const groups: Group[] = [];
  let current: Group | null = null;
  let sawRule = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === "user-agent") {
      if (!current || sawRule) {
        current = { agents: [], rules: [] };
        groups.push(current);
        sawRule = false;
      }
      current.agents.push(value.toLowerCase());
    } else if ((field === "allow" || field === "disallow") && current) {
      sawRule = true;
      if (value) current.rules.push({ allow: field === "allow", path: value });
      else if (field === "disallow") { /* empty disallow = allow all, no rule */ }
    }
  }

  const pickGroup = (ua: string): Group | undefined => {
    const uaL = ua.toLowerCase();
    let best: Group | undefined;
    let bestLen = -1;
    for (const g of groups) {
      for (const a of g.agents) {
        if (a === "*" && bestLen < 0) best = g;
        else if (a !== "*" && uaL.includes(a) && a.length > bestLen) { best = g; bestLen = a.length; }
      }
    }
    return best;
  };

  const matchLen = (rulePath: string, path: string): number => {
    // Support the `*` wildcard and `$` end-anchor used in robots.
    if (!rulePath.includes("*") && !rulePath.includes("$")) {
      return path.startsWith(rulePath) ? rulePath.length : -1;
    }
    const re = new RegExp(
      "^" + rulePath.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\$$/, "$"),
    );
    return re.test(path) ? rulePath.length : -1;
  };

  return {
    groups,
    isAllowed(path: string, userAgent = "*"): boolean {
      const g = pickGroup(userAgent);
      if (!g) return true;
      let decision = true;
      let bestLen = -1;
      for (const rule of g.rules) {
        const len = matchLen(rule.path, path);
        if (len > bestLen || (len === bestLen && rule.allow)) {
          if (len >= 0) { decision = rule.allow; bestLen = len; }
        }
      }
      return decision;
    },
  };
}

/** Fetch and parse a site's robots.txt. Returns an allow-all matcher on failure. */
export async function fetchRobots(origin: string, userAgent?: string): Promise<Robots> {
  try {
    const url = new URL("/robots.txt", origin).href;
    const opt: { userAgent?: string; timeoutMs: number; retries: number } = { timeoutMs: 8000, retries: 0 };
    if (userAgent) opt.userAgent = userAgent;
    const res = await fetchPage(url, opt);
    if (!res.ok || !res.html) return parseRobots("");
    return parseRobots(res.html);
  } catch {
    return parseRobots("");
  }
}
