/**
 * Validate an `llms.txt` string against the llmstxt.org shape.
 *
 * Zero dependencies · isomorphic.
 */

/** A single validation finding. */
export interface LlmsIssue {
  level: "error" | "warning";
  message: string;
  /** 1-based line number, when the issue is tied to a specific line. */
  line?: number;
}

/** Result of {@link validateLlmsTxt}. `valid` is false when there is any error. */
export interface LlmsValidation {
  valid: boolean;
  issues: LlmsIssue[];
}

const LINK_RE = /^-\s*\[([^\]]+)\]\(([^)]+)\)\s*(?::\s*(.*))?$/;

/**
 * Check that a string is a well-formed `llms.txt`: it must have the required H1
 * title, and a one-line summary blockquote is recommended. Reports malformed
 * link lines, a missing/duplicate/mis-placed H1, and a missing summary.
 *
 * @returns `{ valid, issues }` — `valid` is true when there are no `error`s
 * (warnings do not fail validation).
 */
export function validateLlmsTxt(txt: string): LlmsValidation {
  const issues: LlmsIssue[] = [];
  const lines = txt.split(/\r?\n/);

  const h1Lines: number[] = [];
  let firstContentIdx = -1;
  let hasSummary = false;
  let summaryBeforeH1 = false;

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    if (firstContentIdx === -1) firstContentIdx = i;
    if (/^#\s+\S/.test(line)) {
      h1Lines.push(i);
    } else if (line.startsWith("> ")) {
      hasSummary = true;
      if (h1Lines.length === 0) summaryBeforeH1 = true;
    } else if (/^-\s*\[/.test(line) && !LINK_RE.test(line)) {
      issues.push({ level: "warning", message: "Malformed link line.", line: i + 1 });
    }
  });

  if (h1Lines.length === 0) {
    issues.push({
      level: "error",
      message: "Missing required H1 title (a line starting with `# `).",
    });
  } else {
    if (h1Lines.length > 1) {
      issues.push({
        level: "warning",
        message: `Found ${h1Lines.length} H1 titles; llms.txt should have exactly one.`,
        line: h1Lines[1]! + 1,
      });
    }
    if (firstContentIdx !== -1 && h1Lines[0] !== firstContentIdx) {
      issues.push({
        level: "warning",
        message: "The H1 title should be the first line of the file.",
        line: firstContentIdx + 1,
      });
    }
  }

  if (!hasSummary) {
    issues.push({
      level: "warning",
      message: "No summary blockquote (`> …`) found; a one-line summary is recommended.",
    });
  } else if (summaryBeforeH1) {
    issues.push({
      level: "warning",
      message: "The summary blockquote appears before the H1 title.",
    });
  }

  return { valid: !issues.some((x) => x.level === "error"), issues };
}
