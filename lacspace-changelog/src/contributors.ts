/**
 * Aggregate the unique authors (and co-authors) of a set of commits into a
 * sorted "Contributors" list, and render it as markdown. Pure: give it parsed
 * commits, get contributors back. No git, no fs.
 */
import type { ParsedCommit } from "./commit.js";

/** One unique contributor, with how many commits they touched. */
export interface Contributor {
  /** Display name (best available). */
  name: string;
  /** Email, when known. */
  email?: string;
  /** Number of commits credited (authored + co-authored). */
  count: number;
}

export interface ContributorsOptions {
  /** Also credit `Co-authored-by:` trailers. Default: true. */
  includeCoAuthors?: boolean;
  /** Drop authors whose email matches any of these (e.g. bots). */
  exclude?: Array<string | RegExp>;
}

function key(name: string, email: string): string {
  const e = email.trim().toLowerCase();
  return e || `name:${name.trim().toLowerCase()}`;
}

function excluded(name: string, email: string, rules: Array<string | RegExp>): boolean {
  const hay = `${name} <${email}>`.toLowerCase();
  return rules.some((r) =>
    typeof r === "string" ? hay.includes(r.toLowerCase()) : r.test(`${name} <${email}>`),
  );
}

/**
 * Collect unique contributors, de-duplicated by email (falling back to name),
 * sorted by commit count descending then name ascending.
 */
export function collectContributors(
  commits: ParsedCommit[],
  opts: ContributorsOptions = {},
): Contributor[] {
  const includeCo = opts.includeCoAuthors ?? true;
  const exclude = opts.exclude ?? [];
  const map = new Map<string, Contributor>();

  const credit = (name: string | undefined, email: string | undefined): void => {
    const n = (name ?? "").trim();
    const e = (email ?? "").trim();
    if (!n && !e) return;
    if (excluded(n, e, exclude)) return;
    const k = key(n, e);
    const existing = map.get(k);
    if (existing) {
      existing.count++;
      // Prefer a non-empty name / email if we learn one later.
      if (!existing.name && n) existing.name = n;
      if (!existing.email && e) existing.email = e;
    } else {
      const c: Contributor = { name: n || e, count: 1 };
      if (e) c.email = e;
      map.set(k, c);
    }
  };

  for (const c of commits) {
    credit(c.authorName, c.authorEmail);
    if (includeCo) {
      for (const co of c.coAuthors) credit(co.name, co.email);
    }
  }

  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
}

export interface RenderContributorsOptions {
  /** Section heading text. Default "Contributors". */
  title?: string;
  /** Heading level (3 = `###`). Default 3. */
  headingLevel?: number;
  /** Show the `(N)` commit count after each name. Default true. */
  showCounts?: boolean;
}

/**
 * Render a markdown "Contributors" section. Returns "" for an empty list.
 */
export function renderContributors(
  contributors: Contributor[],
  opts: RenderContributorsOptions = {},
): string {
  if (!contributors.length) return "";
  const title = opts.title ?? "Contributors";
  const level = opts.headingLevel ?? 3;
  const showCounts = opts.showCounts ?? true;
  const hashes = "#".repeat(level);
  const out: string[] = [`${hashes} ${title}`, ""];
  for (const c of contributors) {
    const suffix = showCounts && c.count > 1 ? ` (${c.count})` : "";
    out.push(`- ${c.name}${suffix}`);
  }
  out.push("");
  return out.join("\n");
}
