/**
 * Render a Keep-a-Changelog style version section from parsed commits, and
 * prepend it to an existing CHANGELOG body (or create a fresh one). Pure string
 * work: give it commits + options, get markdown back. No fs, no git.
 */
import type { ParsedCommit } from "./commit.js";
import type { UrlTemplates } from "./repo.js";
import { urlTemplates } from "./repo.js";

/** One group in the changelog (a heading + the commit types it collects). */
export interface CommitGroup {
  /** Section heading, e.g. "Features". */
  title: string;
  /** Commit types routed to this group. */
  types: string[];
}

/** Default group order and headings (Keep a Changelog-ish). */
export const DEFAULT_GROUPS: CommitGroup[] = [
  { title: "Features", types: ["feat"] },
  { title: "Bug Fixes", types: ["fix"] },
  { title: "Performance", types: ["perf"] },
  { title: "Reverts", types: ["revert"] },
  { title: "Refactors", types: ["refactor"] },
  { title: "Documentation", types: ["docs"] },
  { title: "Styles", types: ["style"] },
  { title: "Tests", types: ["test"] },
  { title: "Build System", types: ["build"] },
  { title: "Continuous Integration", types: ["ci"] },
  { title: "Chores", types: ["chore"] },
];

/**
 * Types hidden by default (present but not rendered) — the noise that rarely
 * belongs in a user-facing changelog. Only Features / Bug Fixes / Performance /
 * Reverts (and BREAKING CHANGES) show by default. Pass `hiddenTypes: []` to
 * render everything.
 */
export const DEFAULT_HIDDEN = [
  "refactor",
  "docs",
  "style",
  "test",
  "chore",
  "ci",
  "build",
];

export interface RenderOptions {
  /** The version being released, e.g. "1.2.0". */
  version: string;
  /** ISO date (YYYY-MM-DD). Defaults to today (UTC). */
  date?: string;
  /** URL templates; defaults to none (plain text, no links). */
  urls?: UrlTemplates;
  /** Group definitions + order. Defaults to {@link DEFAULT_GROUPS}. */
  groups?: CommitGroup[];
  /** Commit types to omit from the body. Defaults to {@link DEFAULT_HIDDEN}. */
  hiddenTypes?: string[];
  /** Previous version/tag, for the compare link. */
  previousTag?: string;
  /** Tag for this release (defaults to `v<version>`), for the compare link. */
  currentTag?: string;
  /** Include non-conventional commits under an "Other Changes" group. Default true. */
  includeOther?: boolean;
  /** Heading level for the version title (2 = `##`). Default 2. */
  headingLevel?: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function escapeMd(s: string): string {
  // keep it light: don't mangle normal text, just avoid accidental headings
  return s.replace(/^#/, "\\#");
}

function commitLine(c: ParsedCommit, urls: UrlTemplates | undefined): string {
  const scope = c.scope ? `**${c.scope}:** ` : "";
  let line = `- ${scope}${escapeMd(c.subject)}`;
  const refs: string[] = [];
  if (c.hash) {
    const short = c.hash.slice(0, 7);
    refs.push(urls && urls.commit(c.hash) ? `[${short}](${urls.commit(c.hash)})` : short);
  }
  const prNum = c.prNumber ?? c.references.find((r) => /close|fix|resolve/.test(r.action))?.issue;
  if (prNum) {
    refs.push(urls && urls.issue(prNum) ? `[#${prNum}](${urls.issue(prNum)})` : `#${prNum}`);
  }
  if (refs.length) line += ` (${refs.join(", ")})`;
  return line;
}

/**
 * Render just the version section (no top `# Changelog` header). This is what
 * the `notes` command prints and what {@link prependChangelog} inserts.
 */
export function renderSection(
  commits: ParsedCommit[],
  opts: RenderOptions,
): string {
  const groups = opts.groups ?? DEFAULT_GROUPS;
  const hidden = new Set(opts.hiddenTypes ?? DEFAULT_HIDDEN);
  const includeOther = opts.includeOther ?? true;
  const date = opts.date ?? today();
  const urls = opts.urls;
  const level = opts.headingLevel ?? 2;
  const hashes = "#".repeat(level);
  const subHashes = "#".repeat(level + 1);

  // Title with optional compare link.
  const currentTag = opts.currentTag ?? `v${opts.version}`;
  let title: string;
  if (urls && opts.previousTag && urls.compare(opts.previousTag, currentTag)) {
    title = `${hashes} [${opts.version}](${urls.compare(opts.previousTag, currentTag)}) (${date})`;
  } else {
    title = `${hashes} ${opts.version} (${date})`;
  }

  const out: string[] = [title, ""];

  // BREAKING CHANGES first.
  const breaking = commits.filter((c) => c.breaking);
  if (breaking.length) {
    out.push(`${subHashes} ⚠ BREAKING CHANGES`, "");
    for (const c of breaking) {
      const scope = c.scope ? `**${c.scope}:** ` : "";
      const desc = c.breakingDescription ?? c.subject;
      let line = `- ${scope}${escapeMd(desc)}`;
      if (c.hash) {
        const short = c.hash.slice(0, 7);
        line += ` (${urls && urls.commit(c.hash) ? `[${short}](${urls.commit(c.hash)})` : short})`;
      }
      out.push(line);
    }
    out.push("");
  }

  // Route commits to groups.
  const routed = new Set<ParsedCommit>();
  for (const g of groups) {
    if (g.types.some((t) => hidden.has(t))) continue;
    const members = commits.filter(
      (c) => g.types.includes(c.type) && c.conventional && !routed.has(c),
    );
    if (!members.length) continue;
    for (const c of members) routed.add(c);
    out.push(`${subHashes} ${g.title}`, "");
    for (const c of members) out.push(commitLine(c, urls));
    out.push("");
  }

  // Other (non-conventional) commits.
  if (includeOther) {
    const others = commits.filter(
      (c) => !routed.has(c) && !c.breaking && (!c.conventional || !isHidden(c.type, hidden, groups)),
    );
    // Only include genuinely-uncategorised commits: non-conventional OR a
    // conventional type that has no (visible) group.
    const trulyOther = others.filter(
      (c) => !c.conventional || !groups.some((g) => g.types.includes(c.type)),
    );
    if (trulyOther.length) {
      out.push(`${subHashes} Other Changes`, "");
      for (const c of trulyOther) out.push(commitLine(c, urls));
      out.push("");
    }
  }

  // Trim trailing blank lines to exactly one.
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n") + "\n";
}

function isHidden(type: string, hidden: Set<string>, groups: CommitGroup[]): boolean {
  if (hidden.has(type)) return true;
  // hidden if it belongs to a group whose types are all hidden
  const g = groups.find((grp) => grp.types.includes(type));
  if (!g) return false;
  return g.types.every((t) => hidden.has(t));
}

const CHANGELOG_HEADER = `# Changelog

All notable changes to this project are documented here. This file is
generated from [Conventional Commits](https://www.conventionalcommits.org) and
follows [Semantic Versioning](https://semver.org).
`;

/**
 * Insert a rendered section into an existing changelog body (below the top
 * `# Changelog` header, above the first prior entry), or build a new file when
 * `existing` is empty/undefined.
 */
export function prependChangelog(
  section: string,
  existing?: string,
): string {
  const body = section.trimEnd() + "\n";
  if (!existing || !existing.trim()) {
    return `${CHANGELOG_HEADER}\n${body}`;
  }
  const text = existing.replace(/\r\n/g, "\n");
  // Find the end of the leading header block: the first line that starts a
  // version entry (## …) — insert right before it.
  const lines = text.split("\n");
  let insertAt = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s/.test(lines[i]!) || /^##\s*\[/.test(lines[i]!)) {
      insertAt = i;
      break;
    }
  }
  if (insertAt === -1) {
    // No prior entry — keep existing header, append section.
    return text.trimEnd() + "\n\n" + body;
  }
  const head = lines.slice(0, insertAt).join("\n").trimEnd();
  const tail = lines.slice(insertAt).join("\n").trimStart();
  return `${head}\n\n${body}\n${tail}`.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
