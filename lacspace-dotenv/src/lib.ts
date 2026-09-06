/**
 * lacspace-dotenv — lint, diff, sync and type your `.env` files.
 *
 * A robust zero-dependency `.env` parser plus tools to catch missing keys,
 * duplicates, syntax slips and committed secrets, and to generate a typed env
 * accessor. This is a dev tool for `.env` *files*; for runtime schema
 * validation of `process.env` see the separate `@lacspace/env` package.
 *
 * ```ts
 * import { parseEnv, lintEnv, diffEnvs, detectSecrets, genTypes, checkEnv } from "lacspace-dotenv";
 *
 * const { map, errors } = parseEnv("export API_KEY=abc\nPORT=3000\n");
 * const issues = lintEnv("api_key = 1\nAPI_KEY=2\n");
 * const { missingInB } = diffEnvs(envText, exampleText);
 * const dts = genTypes(Object.keys(map));
 * const { ok, missing } = checkEnv(exampleText, process.env);
 * ```
 */
export { parseEnv } from "./parse.js";
export type { EnvEntry, ParseError, ParseResult } from "./parse.js";

export { lintEnv } from "./lint.js";
export type { Issue, IssueLevel } from "./lint.js";

export { detectSecrets, maskSecret } from "./secrets.js";
export type { SecretHit } from "./secrets.js";

export { diffEnvs, appendKeys } from "./diff.js";
export type { EnvDiff } from "./diff.js";

export { genTypes } from "./types-gen.js";
export type { GenTypesOptions } from "./types-gen.js";

export { checkEnv } from "./check.js";
export type { CheckResult } from "./check.js";
