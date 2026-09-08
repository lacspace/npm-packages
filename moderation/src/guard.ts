/**
 * Output guardrails and a composed input/output {@link Guard} for chat
 * pipelines. Everything here is synchronous and deterministic — it layers on
 * top of {@link detectPii}, {@link redactPii} and {@link detectPromptInjection}.
 */

import { detectPii, redactPii } from "./pii";
import { detectPromptInjection, DEFAULT_INJECTION_THRESHOLD } from "./injection";
import type {
  Guard,
  GuardConfig,
  GuardOutputResult,
  InputCheck,
  OutputRule,
  RedactPiiOptions,
  Violation,
} from "./types";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Apply a list of {@link OutputRule}s to model output. Rules run in order;
 * rewriting rules (`noPii`, `maxLength`, `blocklist`) mutate the working output
 * that later rules see. Returns whether every rule passed, the violations, and
 * the (possibly rewritten) output.
 */
export function guardOutput(text: string, rules: OutputRule[]): GuardOutputResult {
  let output = text;
  const violations: Violation[] = [];

  for (const rule of rules) {
    switch (rule.type) {
      case "noPii": {
        const findings = detectPii(output, { types: rule.types });
        if (findings.length > 0) {
          const redact = rule.redact ?? true;
          if (redact) {
            output = redactPii(output, { mask: rule.mask, types: rule.types }).text;
          }
          violations.push({
            rule: "noPii",
            message: `Output contains ${findings.length} PII item(s): ${findings
              .map((f) => f.type)
              .join(", ")}.`,
            redacted: redact,
            details: { findings },
          });
        }
        break;
      }
      case "maxLength": {
        if (output.length > rule.max) {
          const truncate = rule.truncate ?? false;
          if (truncate) output = output.slice(0, rule.max);
          violations.push({
            rule: "maxLength",
            message: `Output length ${text.length} exceeds max ${rule.max}.`,
            redacted: truncate,
            details: { length: text.length, max: rule.max },
          });
        }
        break;
      }
      case "mustBeJson": {
        let ok = true;
        try {
          JSON.parse(output);
        } catch {
          ok = false;
        }
        if (!ok) {
          violations.push({
            rule: "mustBeJson",
            message: "Output is not valid JSON.",
            redacted: false,
          });
        }
        break;
      }
      case "blocklist": {
        const flags = rule.caseSensitive ? "g" : "gi";
        const hit: string[] = [];
        for (const term of rule.terms) {
          const re = new RegExp(escapeRegex(term), flags);
          if (re.test(output)) hit.push(term);
        }
        if (hit.length > 0) {
          const redact = rule.redact ?? false;
          if (redact) {
            for (const term of hit) {
              const re = new RegExp(escapeRegex(term), flags);
              output = output.replace(re, rule.mask ?? "[REDACTED]");
            }
          }
          violations.push({
            rule: "blocklist",
            message: `Output contains blocked term(s): ${hit.join(", ")}.`,
            redacted: redact,
            details: { terms: hit },
          });
        }
        break;
      }
      case "allowlistRegex": {
        const re =
          typeof rule.pattern === "string" ? new RegExp(rule.pattern) : rule.pattern;
        if (!re.test(output)) {
          violations.push({
            rule: "allowlistRegex",
            message: `Output does not match required pattern ${re}.`,
            redacted: false,
            details: { pattern: re.source },
          });
        }
        break;
      }
      case "noPromptInjection": {
        const res = detectPromptInjection(output);
        const threshold = rule.threshold ?? DEFAULT_INJECTION_THRESHOLD;
        if (res.score >= threshold) {
          violations.push({
            rule: "noPromptInjection",
            message: `Output looks like it echoes a prompt-injection attempt (${res.matches.join(
              ", ",
            )}).`,
            redacted: false,
            details: { score: res.score, matches: res.matches },
          });
        }
        break;
      }
    }
  }

  return { ok: violations.length === 0, violations, output };
}

/**
 * Compose an input+output {@link Guard} for a chat pipeline from a declarative
 * {@link GuardConfig}. `checkInput` screens/redacts user input; `checkOutput`
 * runs {@link guardOutput} with the configured rules.
 */
export function createGuard(config: GuardConfig = {}): Guard {
  const inputCfg = config.input ?? {};
  const outputRules = config.output ?? [];

  return {
    checkInput(text: string): InputCheck {
      const violations: Violation[] = [];
      let out = text;
      let blocked = false;

      const injection = detectPromptInjection(text);

      if (inputCfg.blockPromptInjection) {
        const threshold = inputCfg.injectionThreshold ?? DEFAULT_INJECTION_THRESHOLD;
        if (injection.score >= threshold) {
          blocked = true;
          violations.push({
            rule: "noPromptInjection",
            message: `Input looks like a prompt-injection attempt (${injection.matches.join(
              ", ",
            )}).`,
            redacted: false,
            details: { score: injection.score, matches: injection.matches },
          });
        }
      }

      if (typeof inputCfg.maxLength === "number" && text.length > inputCfg.maxLength) {
        blocked = true;
        violations.push({
          rule: "maxLength",
          message: `Input length ${text.length} exceeds max ${inputCfg.maxLength}.`,
          redacted: false,
          details: { length: text.length, max: inputCfg.maxLength },
        });
      }

      if (inputCfg.blocklist && inputCfg.blocklist.length > 0) {
        const hit: string[] = [];
        for (const term of inputCfg.blocklist) {
          const re = new RegExp(escapeRegex(term), "gi");
          if (re.test(text)) hit.push(term);
        }
        if (hit.length > 0) {
          blocked = true;
          violations.push({
            rule: "blocklist",
            message: `Input contains blocked term(s): ${hit.join(", ")}.`,
            redacted: false,
            details: { terms: hit },
          });
        }
      }

      if (inputCfg.redactPii) {
        const redactOpts: RedactPiiOptions =
          inputCfg.redactPii === true ? {} : inputCfg.redactPii;
        const r = redactPii(out, redactOpts);
        if (r.findings.length > 0) {
          out = r.text;
          violations.push({
            rule: "noPii",
            message: `Redacted ${r.findings.length} PII item(s) from input.`,
            redacted: true,
            details: { findings: r.findings },
          });
        }
      }

      return { ok: !blocked, blocked, text: out, violations, injection };
    },

    checkOutput(text: string): GuardOutputResult {
      return guardOutput(text, outputRules);
    },
  };
}
