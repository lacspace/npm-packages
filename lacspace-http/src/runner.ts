/**
 * The `.http` file runner: parse a file, resolve `{{variables}}` from an env
 * block / CLI vars / previously captured values, send each request in order,
 * evaluate its assertions, and feed captured values forward to the next
 * request. A single failed assertion (or transport error) makes the whole run
 * fail — that's what turns a `.http` file into a CI test suite.
 */
import { parseHttpFile } from "./httpfile.js";
import type { HttpFileRequest } from "./httpfile.js";
import { assembleRequest, sendRequest } from "./request.js";
import type { RequestSpec, ResponseRecord, SendOptions } from "./request.js";
import { parseAssertion, evalAssertion, captureValue } from "./assert.js";
import type { AssertResult } from "./assert.js";
import { resolveVars, makeScope } from "./vars.js";
import type { VarScope } from "./vars.js";

/** Options for {@link runHttpFile}. */
export interface RunOptions extends SendOptions {
  /** Variables from an env block (`http-client.env.json` / `.env`). */
  env?: Record<string, string>;
  /** CLI `--var k=v` overrides (highest precedence at start). */
  vars?: Record<string, string>;
  /** Run only the request whose `# @name` matches this. */
  name?: string;
  /** Called after each request completes (for streaming CLI output). */
  onResult?: (result: RequestRunResult) => void;
}

/** The result of running one request from the file. */
export interface RequestRunResult {
  name?: string;
  method: string;
  url: string;
  line: number;
  /** Unresolved `{{vars}}` encountered while building the request. */
  missingVars: string[];
  /** Set when the request could not be sent at all. */
  error?: string;
  response?: ResponseRecord;
  assertions: AssertResult[];
  /** Values captured from this response (name → value). */
  captured: Record<string, string>;
  /** True if it was sent, all assertions passed and no error occurred. */
  ok: boolean;
}

/** The overall result of a run. */
export interface RunResult {
  results: RequestRunResult[];
  passed: number;
  failed: number;
  ok: boolean;
}

function resolveSpec(req: HttpFileRequest, scope: VarScope): { spec: RequestSpec; missing: string[] } {
  const missing: string[] = [];
  const collect = (r: { text: string; missing: string[] }): string => {
    missing.push(...r.missing);
    return r.text;
  };
  const url = collect(resolveVars(req.url, scope));
  const headers: Array<[string, string]> = req.headers.map(([k, v]) => [
    collect(resolveVars(k, scope)),
    collect(resolveVars(v, scope)),
  ]);
  const spec: RequestSpec = { method: req.method, url, headers };
  if (req.body !== undefined) spec.body = collect(resolveVars(req.body, scope));
  return { spec, missing };
}

/** Parse and run a `.http` document. */
export async function runHttpFile(source: string, opts: RunOptions = {}): Promise<RunResult> {
  const requests = parseHttpFile(source);
  const scope = makeScope(opts.env, opts.vars);
  const results: RequestRunResult[] = [];

  const selected = opts.name
    ? requests.filter((r) => r.name === opts.name)
    : requests;

  const sendOpts: SendOptions = {};
  if (opts.timeoutMs !== undefined) sendOpts.timeoutMs = opts.timeoutMs;
  if (opts.maxSize !== undefined) sendOpts.maxSize = opts.maxSize;
  if (opts.maxRedirects !== undefined) sendOpts.maxRedirects = opts.maxRedirects;
  if (opts.followRedirects !== undefined) sendOpts.followRedirects = opts.followRedirects;
  if (opts.fetchImpl !== undefined) sendOpts.fetchImpl = opts.fetchImpl;

  for (const req of selected) {
    const { spec, missing } = resolveSpec(req, scope);
    const result: RequestRunResult = {
      method: spec.method,
      url: spec.url,
      line: req.line,
      missingVars: missing,
      assertions: [],
      captured: {},
      ok: false,
    };
    if (req.name !== undefined) result.name = req.name;

    try {
      const rec = await sendRequest(spec, sendOpts);
      result.response = rec;

      // Captures first, so later assertions in the same request may use them.
      for (const cap of req.captures) {
        const value = captureValue(cap.source, rec);
        if (value !== undefined) {
          result.captured[cap.name] = value;
          scope.set(cap.name, value);
        }
      }

      // Assertions.
      let allPass = true;
      for (const a of req.assertions) {
        try {
          const ar = evalAssertion(parseAssertion(a.expr), rec);
          result.assertions.push(ar);
          if (!ar.ok) allPass = false;
        } catch (err) {
          result.assertions.push({
            ok: false,
            assertion: { lhs: a.expr, op: "==", raw: a.expr },
            actual: undefined,
            message: `invalid assertion "${a.expr}": ${(err as Error).message}`,
          });
          allPass = false;
        }
      }
      result.ok = allPass && missing.length === 0;
    } catch (err) {
      result.error = (err as Error).message;
      result.ok = false;
    }

    results.push(result);
    opts.onResult?.(result);
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  return { results, passed, failed, ok: failed === 0 && results.length > 0 };
}

/** Convenience: assemble a single ad-hoc request from friendly options. */
export { assembleRequest };
