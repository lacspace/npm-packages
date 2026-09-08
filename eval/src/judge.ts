/**
 * LLM-as-judge. The judge model is **injected** — this file never imports a
 * provider, never bundles a key, and never calls anything you did not pass in.
 */
import type { JudgeOptions, Score, Scorer } from "./types";
import { clamp01 } from "./internal";

/**
 * Build the grading prompt handed to the injected judge. Exposed so callers can
 * inspect, log or customise around it.
 */
export function buildJudgePrompt(opts: JudgeOptions): string {
  const scale = opts.scale ?? 10;
  const lines: string[] = [];
  lines.push(
    "You are a strict, fair evaluator grading the quality of an AI assistant's OUTPUT.",
    `Grade it against the CRITERIA on a scale from 0 to ${scale}, where 0 is terrible and ${scale} is perfect.`,
    "",
    `CRITERIA:\n${opts.criteria}`,
  );
  if (opts.rubric) lines.push("", `RUBRIC:\n${opts.rubric}`);
  if (opts.input !== undefined) lines.push("", `INPUT / PROMPT:\n${opts.input}`);
  if (opts.reference !== undefined) lines.push("", `REFERENCE ANSWER:\n${opts.reference}`);
  lines.push(
    "",
    `OUTPUT TO GRADE:\n${opts.output}`,
    "",
    "Respond in exactly this format, nothing before it:",
    `Score: <number>/${scale}`,
    "Reason: <one or two sentences>",
  );
  return lines.join("\n");
}

/** Tolerantly parse a numeric grade (and optional rationale) from judge text. */
export function parseJudgeReply(reply: string, scale: number): { raw: number; reason?: string } {
  const reason = extractReason(reply);
  // 1) "Score: 8/10" or "8 / 10" or "rating 8 out of 10"
  const outOf = reply.match(/(-?\d+(?:\.\d+)?)\s*(?:\/|out of)\s*(\d+(?:\.\d+)?)/i);
  if (outOf) {
    const num = Number(outOf[1]);
    const den = Number(outOf[2]);
    if (den > 0) return { raw: clampToScale((num / den) * scale, scale), reason };
  }
  // 2) explicit "Score: 8" / "rating: 8" / "grade = 7.5"
  const labeled = reply.match(/(?:score|rating|grade)\s*[:=]?\s*(-?\d+(?:\.\d+)?)/i);
  if (labeled) return { raw: clampToScale(Number(labeled[1]), scale), reason };
  // 3) a leading percentage like "85%"
  const pct = reply.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (pct) return { raw: clampToScale((Number(pct[1]) / 100) * scale, scale), reason };
  // 4) first bare number anywhere
  const bare = reply.match(/-?\d+(?:\.\d+)?/);
  if (bare) return { raw: clampToScale(Number(bare[0]), scale), reason };
  // 5) nothing parseable
  return { raw: 0, reason };
}

function clampToScale(n: number, scale: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > scale) return scale;
  return n;
}

function extractReason(reply: string): string | undefined {
  const m = reply.match(/reason(?:ing)?\s*[:=]?\s*(.+)/is);
  if (m && m[1]) return m[1].trim();
  return undefined;
}

/**
 * Grade `output` with an injected LLM judge and return a normalised {@link Score}.
 *
 * Builds a grading prompt from the criteria/rubric, calls `opts.judge`, and
 * tolerantly parses a numeric grade out of the reply (`"Score: 8/10"`,
 * `"rating 7"`, `"85%"`, or a bare number). No model is built in.
 */
export async function judge(opts: JudgeOptions): Promise<Score> {
  const scale = opts.scale ?? 10;
  const threshold = opts.threshold ?? 0.6;
  const name = opts.name ?? "judge";
  const prompt = buildJudgePrompt(opts);
  const reply = await opts.judge(prompt);
  const { raw, reason } = parseJudgeReply(reply ?? "", scale);
  const score = clamp01(raw / scale);
  return {
    name,
    score,
    passed: score >= threshold,
    details: { raw, scale, threshold, reason, reply },
  };
}

/**
 * Curry {@link judge} into a {@link Scorer} for use in {@link scoreAll} /
 * {@link runEval}. The output is supplied later by the runner.
 */
export function judgeScorer(opts: Omit<JudgeOptions, "output">): Scorer {
  return (output: string) => judge({ ...opts, output });
}
