/**
 * A pure Conventional Commits parser. Feed it a raw commit message (subject +
 * optional body/footers) and it returns a structured record. It is tolerant:
 * a message that is not conventional still parses, with `conventional: false`
 * and everything in `subject`, so it can be bucketed under "Other".
 */

/** Metadata attached to a commit before parsing (from git or a test). */
export interface RawCommit {
  /** Full commit message: first line is the subject, rest is body/footers. */
  message: string;
  /** Abbreviated or full commit hash. */
  hash?: string;
  /** Author name. */
  authorName?: string;
  /** Author email. */
  authorEmail?: string;
  /** ISO date string. */
  date?: string;
}

/** A `Key: value` (or `Key #value`) trailer at the foot of a commit. */
export interface Footer {
  key: string;
  value: string;
}

/** An issue/PR reference like `#123`, optionally with an action verb. */
export interface Reference {
  /** e.g. "closes", "fixes", "refs", or "" when just a bare `#123`. */
  action: string;
  /** The numeric issue/PR id, without the `#`. */
  issue: string;
}

/** A parsed co-author from a `Co-authored-by:` trailer. */
export interface CoAuthor {
  name: string;
  email: string;
}

export interface ParsedCommit {
  /** Conventional type (feat, fix, …) lower-cased, or "" when non-conventional. */
  type: string;
  /** Optional scope from `type(scope):`. */
  scope?: string;
  /** True when `!` before `:` OR a `BREAKING CHANGE:` footer is present. */
  breaking: boolean;
  /** True when the header specifically used the `type!:` bang syntax. */
  bang?: boolean;
  /** The description of a breaking change, when a `BREAKING CHANGE:` footer exists. */
  breakingDescription?: string;
  /** The commit subject (after `type(scope): ` for conventional commits). */
  subject: string;
  /** The body text between subject and footers (trimmed), if any. */
  body?: string;
  /** Parsed trailers. */
  footers: Footer[];
  /** Issue/PR references found in subject, body and footers. */
  references: Reference[];
  /** Co-authors from `Co-authored-by:` trailers. */
  coAuthors: CoAuthor[];
  /** Trailing `(#123)` PR number in the subject, if present. */
  prNumber?: string;
  /** True when the message matched the Conventional Commits header shape. */
  conventional: boolean;
  /** True for a `revert:` commit or a `Revert "…"` subject. */
  revert: boolean;
  /** Passed-through metadata. */
  hash?: string;
  authorName?: string;
  authorEmail?: string;
  date?: string;
}

/** The well-known Conventional Commit types (others are still accepted). */
export const KNOWN_TYPES = [
  "feat",
  "fix",
  "perf",
  "refactor",
  "docs",
  "style",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
] as const;

// `type(scope)!: subject`  — scope and `!` optional.
const HEADER_RE = /^([a-zA-Z][\w-]*)(?:\(([^()]*)\))?(!)?:\s+(.+)$/;
const BREAKING_FOOTER_RE = /^BREAKING[ -]CHANGE(?:S)?:\s*(.*)$/i;
const FOOTER_RE = /^([\w-]+|BREAKING[ -]CHANGE(?:S)?)(?::\s+| #)(.+)$/i;
const REVERT_SUBJECT_RE = /^revert:?\s+["']?(.+)$/i;
const REF_RE = /\b(closes?|fix(?:e[sd])?|resolves?|refs?|references?|re)?\s*#(\d+)\b/gi;
const TRAILING_PR_RE = /\s*\(#(\d+)\)\s*$/;

function collectRefs(text: string): Reference[] {
  const out: Reference[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  REF_RE.lastIndex = 0;
  while ((m = REF_RE.exec(text)) !== null) {
    const issue = m[2]!;
    if (seen.has(issue)) continue;
    seen.add(issue);
    out.push({ action: (m[1] ?? "").toLowerCase(), issue });
  }
  return out;
}

/**
 * Parse a single commit. `raw` may be a plain string (just the message) or a
 * {@link RawCommit} carrying hash/author/date metadata.
 */
export function parseCommit(raw: RawCommit | string): ParsedCommit {
  const rc: RawCommit = typeof raw === "string" ? { message: raw } : raw;
  const message = (rc.message ?? "").replace(/\r\n/g, "\n");
  const lines = message.split("\n");
  const rawSubject = (lines[0] ?? "").trim();

  // Split body/footers: everything after the first blank line.
  let bodyStart = 1;
  while (bodyStart < lines.length && lines[bodyStart]!.trim() === "") bodyStart++;
  const rest = lines.slice(bodyStart);

  // Footers are trailing lines matching `Key: value` / `Key #value`, possibly
  // several in a contiguous block at the very end. We scan from the bottom.
  const footers: Footer[] = [];
  const coAuthors: CoAuthor[] = [];
  let breaking = false;
  let breakingDescription: string | undefined;

  // Identify the footer block: contiguous trailer-shaped lines at the end.
  let footerBlockStart = rest.length;
  for (let i = rest.length - 1; i >= 0; i--) {
    const line = rest[i]!;
    if (line.trim() === "") {
      // A blank line terminates the footer block scan only if we already have
      // footer lines below it.
      if (footerBlockStart < rest.length) break;
      continue;
    }
    if (FOOTER_RE.test(line) || BREAKING_FOOTER_RE.test(line)) {
      footerBlockStart = i;
    } else {
      break;
    }
  }

  const bodyLines = rest.slice(0, footerBlockStart);
  const footerLines = rest.slice(footerBlockStart);

  for (const line of footerLines) {
    if (line.trim() === "") continue;
    const bm = BREAKING_FOOTER_RE.exec(line);
    if (bm) {
      breaking = true;
      const desc = (bm[1] ?? "").trim();
      if (desc) breakingDescription = desc;
      footers.push({ key: "BREAKING CHANGE", value: desc });
      continue;
    }
    const fm = FOOTER_RE.exec(line);
    if (fm) {
      const key = fm[1]!;
      const value = fm[2]!.trim();
      footers.push({ key, value });
      if (/^co-authored-by$/i.test(key)) {
        const cm = /^(.*?)\s*<([^>]+)>/.exec(value);
        if (cm) coAuthors.push({ name: cm[1]!.trim(), email: cm[2]!.trim() });
        else coAuthors.push({ name: value, email: "" });
      }
    }
  }

  const body = bodyLines.join("\n").trim() || undefined;

  // Trailing PR number in the subject, e.g. "add thing (#123)".
  let subjectForParse = rawSubject;
  let prNumber: string | undefined;
  const prMatch = TRAILING_PR_RE.exec(subjectForParse);
  if (prMatch) {
    prNumber = prMatch[1]!;
    subjectForParse = subjectForParse.replace(TRAILING_PR_RE, "").trim();
  }

  const header = HEADER_RE.exec(subjectForParse);
  let type = "";
  let scope: string | undefined;
  let subject = subjectForParse;
  let conventional = false;
  let bang = false;
  if (header) {
    conventional = true;
    type = header[1]!.toLowerCase();
    const rawScope = header[2];
    if (rawScope && rawScope.trim()) scope = rawScope.trim();
    if (header[3] === "!") {
      breaking = true;
      bang = true;
    }
    subject = header[4]!.trim();
  }

  const revert =
    type === "revert" || REVERT_SUBJECT_RE.test(rawSubject) === true;

  // References across subject + body + footers.
  const refText = [subjectForParse, body ?? "", ...footers.map((f) => `${f.key} #${f.value}`)]
    .join("\n");
  const references = collectRefs(refText);

  const result: ParsedCommit = {
    type,
    breaking,
    subject,
    footers,
    references,
    coAuthors,
    conventional,
    revert,
  };
  if (scope !== undefined) result.scope = scope;
  if (bang) result.bang = true;
  if (breakingDescription !== undefined) result.breakingDescription = breakingDescription;
  if (body !== undefined) result.body = body;
  if (prNumber !== undefined) result.prNumber = prNumber;
  if (rc.hash !== undefined) result.hash = rc.hash;
  if (rc.authorName !== undefined) result.authorName = rc.authorName;
  if (rc.authorEmail !== undefined) result.authorEmail = rc.authorEmail;
  if (rc.date !== undefined) result.date = rc.date;
  return result;
}

/** Parse many commits. */
export function parseCommits(raws: Array<RawCommit | string>): ParsedCommit[] {
  return raws.map(parseCommit);
}
