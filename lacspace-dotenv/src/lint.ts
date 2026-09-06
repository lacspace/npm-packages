/**
 * Lint the contents of a `.env` file: syntax errors, duplicate keys, spacing
 * around `=`, non-`UPPER_SNAKE_CASE` names, empty values, trailing whitespace
 * and likely committed secrets.
 */
import { parseEnv } from "./parse.js";
import { detectSecrets, maskSecret } from "./secrets.js";
import { resolveEnv } from "./interpolate.js";

export type IssueLevel = "error" | "warn";

/** Options for {@link lintEnv}. */
export interface LintOptions {
  /** Keys to skip during secret detection (see {@link detectSecrets}). */
  allow?: string[];
}

/** A single lint finding. */
export interface Issue {
  /** 1-based line number. */
  line: number;
  level: IssueLevel;
  /** A stable rule id, e.g. `duplicate-key`, `secret`, `naming`. */
  rule: string;
  message: string;
  key?: string;
}

const NAME_RE = /^[A-Z][A-Z0-9_]*$/;

/** Lint a `.env` file's text. Returns findings sorted by line. */
export function lintEnv(text: string, opts: LintOptions = {}): Issue[] {
  const issues: Issue[] = [];
  const { entries, errors, map } = parseEnv(text);
  const lines = text.split(/\r?\n/);

  for (const e of errors) {
    issues.push({ line: e.line, level: "error", rule: "syntax", message: e.message });
  }

  const firstSeen = new Map<string, number>();
  for (const e of entries) {
    const prev = firstSeen.get(e.key);
    if (prev !== undefined) {
      issues.push({
        line: e.line, level: "warn", rule: "duplicate-key", key: e.key,
        message: `duplicate key ${e.key} (first defined on line ${prev}) — the later value wins`,
      });
    } else {
      firstSeen.set(e.key, e.line);
    }
  }

  for (const e of entries) {
    if (!NAME_RE.test(e.key)) {
      issues.push({
        line: e.line, level: "warn", rule: "naming", key: e.key,
        message: `key ${e.key} is not UPPER_SNAKE_CASE`,
      });
    }
    if (e.value === "") {
      issues.push({
        line: e.line, level: "warn", rule: "empty-value", key: e.key,
        message: `key ${e.key} has an empty value`,
      });
    }
    const raw = lines[e.line - 1] ?? "";
    const m = /^[ \t]*(?:export[ \t]+)?([^=]*?)=(.*)$/.exec(raw);
    if (m) {
      if (/[ \t]$/.test(m[1]!)) {
        issues.push({
          line: e.line, level: "warn", rule: "space-around-equals", key: e.key,
          message: `whitespace before '=' for ${e.key}`,
        });
      }
      if (/^[ \t]/.test(m[2]!) && m[2]!.trim() !== "") {
        issues.push({
          line: e.line, level: "warn", rule: "space-around-equals", key: e.key,
          message: `whitespace after '=' for ${e.key}`,
        });
      }
    }
    if (raw.trim() !== "" && /[ \t]$/.test(raw)) {
      issues.push({
        line: e.line, level: "warn", rule: "trailing-whitespace", key: e.key,
        message: `trailing whitespace on line ${e.line}`,
      });
    }
  }

  for (const s of detectSecrets(map, { allow: opts.allow })) {
    const line = firstSeen.get(s.key) ?? 0;
    issues.push({
      line, level: "warn", rule: "secret", key: s.key,
      message: `possible ${s.kind} committed in ${s.key} (${maskSecret(map[s.key] ?? "")})`,
    });
  }

  // `${VAR}` interpolation problems: dangling references and cycles.
  const { undefinedRefs, circular } = resolveEnv(map);
  for (const u of undefinedRefs) {
    issues.push({
      line: firstSeen.get(u.key) ?? 0, level: "warn", rule: "undefined-ref", key: u.key,
      message: `${u.key} references undefined variable \${${u.ref}}`,
    });
  }
  for (const cycle of circular) {
    const head = cycle[0]!;
    issues.push({
      line: firstSeen.get(head) ?? 0, level: "error", rule: "circular-ref", key: head,
      message: `circular reference: ${cycle.join(" → ")}`,
    });
  }

  issues.sort((a, b) => a.line - b.line || (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
  return issues;
}
