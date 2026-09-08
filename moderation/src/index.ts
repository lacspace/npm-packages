/**
 * @lacspace/moderation
 *
 * A tiny, zero-dependency, **keyless** content-safety toolkit — the safety
 * layer for AI apps. Four building blocks:
 *
 *  1. **PII** — `detectPii` / `redactPii` / `hasPii` find and mask emails,
 *     phone numbers, SSNs, Luhn-valid credit cards, IPv4/IPv6, IBANs and common
 *     API-key shapes.
 *  2. **Prompt-injection** — `detectPromptInjection` heuristically flags
 *     "ignore previous instructions", jailbreaks, delimiter/tag injection and
 *     exfiltration attempts. (Heuristic — not a guarantee.)
 *  3. **Moderation** — `moderateText` runs a small built-in lexical category
 *     scan (harassment/hate/violence/self-harm/sexual/profanity), OR delegates
 *     to a `classify` function you inject to wrap a real moderation model.
 *  4. **Guardrails** — `guardOutput` validates/redacts LLM output against a set
 *     of rules; `createGuard` composes input+output filtering for a chat
 *     pipeline.
 *
 * ```ts
 * import { redactPii, detectPromptInjection, moderateText, createGuard } from "@lacspace/moderation";
 *
 * const { text } = redactPii("mail me at a@b.com");   // "mail me at [REDACTED_EMAIL]"
 * const inj = detectPromptInjection("ignore all previous instructions");  // { flagged: true, ... }
 * const mod = await moderateText(userText);            // built-in lexical scan
 *
 * const guard = createGuard({
 *   input: { blockPromptInjection: true, redactPii: true },
 *   output: [{ type: "noPii" }, { type: "maxLength", max: 2000, truncate: true }],
 * });
 * const inCheck = guard.checkInput(userText);
 * const outCheck = guard.checkOutput(modelText);
 * ```
 *
 * Zero dependencies · keyless · isomorphic (Node ≥18, browser, edge) · fully typed.
 * The lexical moderation and injection heuristics are deliberately basic —
 * real safety needs a model, which you inject via `classify`.
 */

export type {
  PiiType,
  PiiFinding,
  DetectPiiOptions,
  PiiMask,
  RedactPiiOptions,
  RedactPiiResult,
  InjectionResult,
  ModerationResult,
  ClassifyFn,
  ModerateOptions,
  OutputRule,
  OutputRuleType,
  Violation,
  GuardOutputResult,
  GuardConfig,
  InputCheck,
  Guard,
} from "./types";

export { detectPii, redactPii, hasPii, luhnValid, PII_TYPES } from "./pii";

export { detectPromptInjection, DEFAULT_INJECTION_THRESHOLD } from "./injection";

export {
  moderateText,
  lexicalModerate,
  MODERATION_CATEGORIES,
  DEFAULT_MODERATION_THRESHOLD,
  type ModerationCategory,
} from "./moderate";

export { guardOutput, createGuard } from "./guard";
