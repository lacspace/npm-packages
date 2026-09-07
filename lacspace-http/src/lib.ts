/**
 * lacspace-http — a keyless, zero-dependency terminal API client and
 * `.http`/`.rest` file runner. Send one-off requests, or run a file of named
 * requests with `{{variables}}`, response capture & chaining, and assertions,
 * so a `.http` file doubles as an API test suite you can run in CI.
 *
 * Everything is built on the global `fetch` and Node built-ins — no runtime
 * dependencies. The `.http` parser, the JSON-path evaluator and the assertion
 * engine are all hand-written (no `eval`).
 *
 * ```ts
 * import { assembleRequest, sendRequest, runHttpFile } from "lacspace-http";
 *
 * // Ad-hoc request
 * const spec = assembleRequest("https://api.example.com/users", {
 *   method: "POST",
 *   jsonKv: ["name=Ada", "admin:=true"],
 *   bearer: "TOKEN",
 * });
 * const res = await sendRequest(spec, { timeoutMs: 5000 });
 * console.log(res.status, res.json);
 *
 * // Run a .http file as a test suite
 * const file = `
 * # @name login
 * POST https://api.example.com/login
 * Content-Type: application/json
 *
 * { "user": "ada", "pass": "{{password}}" }
 * # @capture token = body.$.access_token
 * # @assert status == 200
 *
 * ###
 * GET https://api.example.com/me
 * Authorization: Bearer {{token}}
 * # @assert body.$.user == "ada"
 * `;
 * const result = await runHttpFile(file, { vars: { password: "hunter2" } });
 * console.log(result.ok, `${result.passed} passed / ${result.failed} failed`);
 * ```
 */

export { evalPath, parseJsonPath } from "./jsonpath.js";
export type { JsonPathSegment } from "./jsonpath.js";

export {
  resolveVars,
  makeScope,
  parseEnvJson,
  parseDotenv,
  parseKvPairs,
} from "./vars.js";
export type { VarScope, ResolveResult } from "./vars.js";

export { parseHttpFile } from "./httpfile.js";
export type {
  HttpFileRequest,
  CaptureDirective,
  AssertDirective,
} from "./httpfile.js";

export {
  assembleRequest,
  sendRequest,
  toCurl,
} from "./request.js";
export type {
  RequestSpec,
  AssembleOptions,
  SendOptions,
  ResponseRecord,
  CurlOptions,
} from "./request.js";

export {
  parseAssertion,
  evalAssertion,
  runAssertion,
  resolveLhs,
  captureValue,
} from "./assert.js";
export type { Assertion, AssertOp, AssertResult } from "./assert.js";

export { runHttpFile } from "./runner.js";
export type { RunOptions, RunResult, RequestRunResult } from "./runner.js";

export {
  humanSize,
  statusColor,
  prettyJson,
  isJsonContentType,
} from "./format.js";
