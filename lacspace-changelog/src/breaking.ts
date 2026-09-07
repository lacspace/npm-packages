/**
 * Pure helpers for detecting and collecting breaking changes across a set of
 * parsed commits. `parseCommit` already flags `breaking` from BOTH the `type!:`
 * syntax and a `BREAKING CHANGE:` footer; these helpers surface that as a list
 * and a boolean so the CLI, the renderer and the bump engine can share one
 * source of truth. No git, no fs.
 */
import type { ParsedCommit } from "./commit.js";

/** A single breaking change extracted from a commit. */
export interface BreakingChange {
  /** The commit that introduced it. */
  commit: ParsedCommit;
  /** Optional scope from `type(scope)!:`. */
  scope?: string;
  /**
   * The best available description: the `BREAKING CHANGE:` footer text when
   * present, otherwise the commit subject.
   */
  description: string;
  /** How it was signalled: `"bang"` (`type!:`) and/or `"footer"`. */
  syntax: Array<"bang" | "footer">;
  /** Abbreviated commit hash when known. */
  hash?: string;
}

/** True when a commit carries a `BREAKING CHANGE:` / `BREAKING-CHANGE:` footer. */
export function hasBreakingFooter(commit: ParsedCommit): boolean {
  return commit.footers.some((f) => /^breaking[ -]change/i.test(f.key));
}

/** True when a commit's header used the `type!:` bang syntax. */
export function hasBangBreaking(commit: ParsedCommit): boolean {
  // `bang` is set precisely by parseCommit; fall back to the heuristic (a
  // conventional breaking commit with no footer) for records built by hand.
  if (commit.bang) return true;
  return commit.breaking && commit.conventional && !hasBreakingFooter(commit);
}

/**
 * Collect every breaking change in commit order. Detects both the `type!:`
 * bang and a `BREAKING CHANGE:` footer (a commit may use both).
 */
export function collectBreaking(commits: ParsedCommit[]): BreakingChange[] {
  const out: BreakingChange[] = [];
  for (const c of commits) {
    if (!c.breaking) continue;
    const syntax: Array<"bang" | "footer"> = [];
    const footer = hasBreakingFooter(c);
    if (hasBangBreaking(c)) syntax.push("bang");
    if (footer) syntax.push("footer");
    // Never leave syntax empty (a non-conventional breaking commit is unusual).
    if (syntax.length === 0) syntax.push(footer ? "footer" : "bang");
    const bc: BreakingChange = {
      commit: c,
      description: c.breakingDescription ?? c.subject,
      syntax,
    };
    if (c.scope !== undefined) bc.scope = c.scope;
    if (c.hash !== undefined) bc.hash = c.hash;
    out.push(bc);
  }
  return out;
}

/** True when any commit in the set is breaking (either syntax). */
export function hasBreaking(commits: ParsedCommit[]): boolean {
  return commits.some((c) => c.breaking);
}
