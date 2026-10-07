/**
 * @lacspace/email-lint — a pre-send check for email: will it land in spam or
 * look broken? Plain-English issues with fixes, a 0–100 score and a grade.
 * Zero dependencies, isomorphic.
 */
export { lintEmail, lint } from "./lint";
export { spamPhrases, SPAM_PHRASES } from "./phrases";
export { RULES } from "./rules";
export type {
  Attachment,
  Grade,
  Issue,
  LintInput,
  LintOptions,
  LintResult,
  LintStats,
  Locale,
  RuleId,
  RuleMeta,
  RuleSetting,
  Severity,
} from "./types";
