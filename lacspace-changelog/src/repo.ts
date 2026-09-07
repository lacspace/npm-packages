/**
 * Derive commit / issue / compare URL templates from a repository field
 * (as found in package.json) or an explicit URL. Pure string work — no network.
 * Supports GitHub and GitLab hosted layouts, with a generic fallback.
 */

export type RepoHost = "github" | "gitlab" | "bitbucket" | "unknown";

export interface RepoInfo {
  /** Detected host. */
  host: RepoHost;
  /** Base web URL, e.g. `https://github.com/owner/repo` (no trailing slash). */
  baseUrl: string;
  /** owner/name when parseable. */
  owner?: string;
  name?: string;
}

/**
 * Normalise many repository-url shapes into a clean `https://host/owner/repo`
 * base URL. Handles `git+https://`, `git@github.com:owner/repo.git`,
 * `git://`, `.git` suffixes and a trailing `/`.
 */
export function parseRepository(input: string | undefined | null): RepoInfo | null {
  if (!input) return null;
  let url = input.trim();
  if (!url) return null;

  // scp-like: git@github.com:owner/repo.git
  const scp = /^git@([^:]+):(.+)$/.exec(url);
  if (scp) url = `https://${scp[1]}/${scp[2]}`;

  url = url
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/^ssh:\/\/git@/, "https://")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");

  if (!/^https?:\/\//.test(url)) {
    // shorthand like "owner/repo" → assume GitHub
    if (/^[\w.-]+\/[\w.-]+$/.test(url)) url = `https://github.com/${url}`;
    else return null;
  }

  let host: RepoHost = "unknown";
  if (/github\.com/.test(url)) host = "github";
  else if (/gitlab\.com/.test(url)) host = "gitlab";
  else if (/bitbucket\.org/.test(url)) host = "bitbucket";

  const info: RepoInfo = { host, baseUrl: url };
  const m = /^https?:\/\/[^/]+\/([\w.-]+)\/([\w.-]+)/.exec(url);
  if (m) {
    info.owner = m[1]!;
    info.name = m[2]!;
  }
  return info;
}

export interface UrlTemplates {
  /** Given a commit hash, the URL to its page (or "" if unknown host). */
  commit: (hash: string) => string;
  /** Given an issue/PR number, the URL to it. */
  issue: (num: string) => string;
  /** Given two refs, the compare URL. */
  compare: (from: string, to: string) => string;
  /** The base URL used. */
  baseUrl: string;
  host: RepoHost;
}

/**
 * Build URL templates for a repo. GitLab uses `/-/commit`, `/-/issues`,
 * `/-/compare/a...b`; GitHub uses `/commit`, `/issues`, `/compare/a...b`.
 */
export function urlTemplates(repo: RepoInfo | null): UrlTemplates {
  const base = repo?.baseUrl ?? "";
  const host = repo?.host ?? "unknown";
  if (!base) {
    return {
      commit: () => "",
      issue: () => "",
      compare: () => "",
      baseUrl: "",
      host: "unknown",
    };
  }
  if (host === "gitlab") {
    return {
      commit: (h) => `${base}/-/commit/${h}`,
      issue: (n) => `${base}/-/issues/${n}`,
      compare: (a, b) => `${base}/-/compare/${a}...${b}`,
      baseUrl: base,
      host,
    };
  }
  if (host === "bitbucket") {
    return {
      commit: (h) => `${base}/commits/${h}`,
      issue: (n) => `${base}/issues/${n}`,
      compare: (a, b) => `${base}/branches/compare/${b}%0D${a}`,
      baseUrl: base,
      host,
    };
  }
  // github + generic fallback
  return {
    commit: (h) => `${base}/commit/${h}`,
    issue: (n) => `${base}/issues/${n}`,
    compare: (a, b) => `${base}/compare/${a}...${b}`,
    baseUrl: base,
    host: host === "unknown" ? "unknown" : host,
  };
}
