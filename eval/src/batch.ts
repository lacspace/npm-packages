/**
 * Batch evaluation: run many {@link EvalCase}s and summarise pass-rate and
 * average score into an {@link EvalReport}.
 */
import type { CaseResult, EvalCase, EvalReport } from "./types";
import { scoreAll } from "./aggregate";

/** Options for {@link runEval}. */
export interface RunEvalOptions {
  /**
   * Run cases concurrently (`true`, default) or strictly one after another
   * (`false`). Sequential is handy when the injected judge/embedder is rate
   * limited.
   */
  parallel?: boolean;
}

/**
 * Evaluate a list of cases and produce an {@link EvalReport}.
 *
 * `passRate` is the fraction of cases where every scorer passed; `averageScore`
 * is the mean of the per-case aggregate scores; `passed` is `true` only when
 * every case passed. An empty suite reports `passRate` and `averageScore` of
 * `1` and `passed: true`.
 */
export async function runEval(cases: EvalCase[], opts: RunEvalOptions = {}): Promise<EvalReport> {
  const parallel = opts.parallel ?? true;

  const evalOne = async (c: EvalCase): Promise<CaseResult> => {
    const res = await scoreAll(c.output, c.scorers);
    return {
      ...res,
      name: c.name,
      input: c.input,
      expected: c.expected,
    };
  };

  let results: CaseResult[];
  if (parallel) {
    results = await Promise.all(cases.map(evalOne));
  } else {
    results = [];
    for (const c of cases) results.push(await evalOne(c));
  }

  const n = results.length;
  const passedCount = results.filter((r) => r.passed).length;
  const passRate = n === 0 ? 1 : passedCount / n;
  const averageScore = n === 0 ? 1 : results.reduce((a, r) => a + r.score, 0) / n;
  const passed = passedCount === n;

  return { results, passRate, averageScore, passed };
}
