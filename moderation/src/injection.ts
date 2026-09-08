/**
 * Heuristic prompt-injection detection.
 *
 * This is a **best-effort lexical heuristic**, not a guarantee: it flags the
 * common phrasings attackers use to override a system prompt, elicit hidden
 * instructions, jailbreak a persona, inject fake delimiters, or exfiltrate
 * secrets. Determined adversaries can evade it. Treat a clean result as "no
 * obvious attack", never as "safe", and pair it with a real defence
 * (privilege separation, output guarding, a moderation model).
 */

import type { InjectionResult } from "./types";

interface Pattern {
  name: string;
  regex: RegExp;
  /** How strongly a hit contributes to the suspicion score, in `[0, 1]`. */
  weight: number;
}

const PATTERNS: Pattern[] = [
  {
    name: "ignore-previous-instructions",
    regex: /\b(?:ignore|disregard|forget|override)\b[\s\S]{0,40}\b(?:previous|prior|above|earlier|all)\b[\s\S]{0,20}\b(?:instructions?|prompts?|rules?|context)\b/i,
    weight: 0.9,
  },
  {
    name: "override-system-prompt",
    regex: /\b(?:ignore|disregard|bypass|reveal|show|print|repeat|leak)\b[\s\S]{0,30}\b(?:system|developer|initial)\s+(?:prompt|message|instructions?)\b/i,
    weight: 0.9,
  },
  {
    name: "role-reassignment",
    regex: /\byou\s+are\s+now\b|\bfrom\s+now\s+on\s+you\b|\bact\s+as\s+(?:if|an?|the)\b|\bpretend\s+(?:to\s+be|you)\b/i,
    weight: 0.6,
  },
  {
    name: "jailbreak-persona",
    regex: /\b(?:DAN|do\s+anything\s+now|developer\s+mode|jailbreak|unfiltered|no\s+restrictions?|without\s+(?:any\s+)?(?:restrictions?|filters?|rules?|guidelines?))\b/i,
    weight: 0.8,
  },
  {
    name: "ignore-safety",
    regex: /\b(?:ignore|bypass|disable|turn\s+off|forget)\b[\s\S]{0,30}\b(?:safety|guidelines?|guardrails?|policy|policies|content\s+policy|moderation)\b/i,
    weight: 0.8,
  },
  {
    name: "delimiter-injection",
    regex: /(?:^|\n)\s*(?:```|---|===|###)?\s*(?:system|assistant|user)\s*(?::|>|\])/i,
    weight: 0.6,
  },
  {
    name: "tag-injection",
    regex: /<\/?(?:system|assistant|user|im_start|im_end|instructions?)\b[^>]*>|\[\/?(?:system|inst|instructions?)\]/i,
    weight: 0.7,
  },
  {
    name: "exfiltration",
    regex: /\b(?:reveal|show|print|repeat|tell\s+me|what\s+(?:are|is|were))\b[\s\S]{0,40}\b(?:your\s+(?:instructions?|system\s+prompt|rules?|guidelines?)|the\s+(?:system\s+prompt|hidden\s+(?:prompt|instructions?))|api\s*keys?|secrets?|credentials?)\b/i,
    weight: 0.85,
  },
  {
    name: "instruction-negation",
    regex: /\b(?:do\s+not|don't|never)\b[\s\S]{0,20}\b(?:follow|obey|adhere\s+to)\b[\s\S]{0,20}\b(?:previous|above|system|prior)\b/i,
    weight: 0.7,
  },
];

/** Default suspicion score at/above which input is `flagged`. */
export const DEFAULT_INJECTION_THRESHOLD = 0.5;

/**
 * Scan `text` for prompt-injection patterns. Returns the matched pattern names,
 * a rough `[0, 1]` suspicion `score` (the strongest single match, nudged up by
 * additional matches), and whether it crosses the flag threshold.
 *
 * Heuristic only — see the module docstring.
 */
export function detectPromptInjection(text: string): InjectionResult {
  const matches: string[] = [];
  let strongest = 0;
  for (const p of PATTERNS) {
    if (p.regex.test(text)) {
      matches.push(p.name);
      if (p.weight > strongest) strongest = p.weight;
    }
  }
  // Extra matches raise confidence a little, capped at 1.
  const extra = Math.max(0, matches.length - 1) * 0.05;
  const score = matches.length === 0 ? 0 : Math.min(1, strongest + extra);
  return {
    flagged: score >= DEFAULT_INJECTION_THRESHOLD,
    score,
    matches,
  };
}
