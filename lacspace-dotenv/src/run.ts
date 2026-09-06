/**
 * `run` — load one or more `.env` files, then execute a command with the merged
 * environment (dotenv-cli style). The environment-building step
 * ({@link mergeEnv}) is a pure function so it can be unit-tested without
 * spawning a process; {@link runWith} does the actual spawn.
 */
import { spawnSync } from "node:child_process";
import { resolveEnv } from "./interpolate.js";

/** Options for {@link mergeEnv}. */
export interface MergeEnvOptions {
  /** File values override the base env (default `true`, like an explicit `-e`). */
  override?: boolean;
  /** Resolve `${VAR}` references in the merged file values (default `false`). */
  expand?: boolean;
}

/**
 * Merge parsed `.env` maps over a base environment (default `{}`).
 *
 *   - Among `files`, **later files win** (right-most `-e` overrides).
 *   - With `override` (the default) file values also win over `base`; set it to
 *     `false` to keep any value already present in `base`.
 *   - With `expand`, `${VAR}` references in the file values are resolved against
 *     the merged environment first.
 *
 * `undefined` values in `base` are dropped. Returns a plain string map suitable
 * for `spawn`'s `env` option.
 */
export function mergeEnv(
  files: Record<string, string>[],
  base: Record<string, string | undefined> = {},
  opts: MergeEnvOptions = {},
): Record<string, string> {
  const override = opts.override ?? true;

  const fileMap: Record<string, string> = {};
  for (const f of files) for (const [k, v] of Object.entries(f)) fileMap[k] = v;

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) if (v !== undefined) out[k] = v;

  if (opts.expand) {
    const { resolved } = resolveEnv({ ...out, ...fileMap });
    for (const k of Object.keys(fileMap)) {
      const v = resolved[k];
      if (v !== undefined) fileMap[k] = v;
    }
  }

  for (const [k, v] of Object.entries(fileMap)) {
    if (override || out[k] === undefined) out[k] = v;
  }
  return out;
}

/** The outcome of {@link runWith}. */
export interface RunResult {
  /** The child's exit code, or `1` if it could not be spawned. */
  code: number;
}

/**
 * Spawn `command args` with the given environment, inheriting stdio and passing
 * the child's exit code straight back. A signal-terminated child maps to
 * `128 + signal` (shell convention).
 */
export function runWith(
  command: string,
  args: string[],
  env: Record<string, string>,
): RunResult {
  const res = spawnSync(command, args, { stdio: "inherit", env });
  if (res.error) {
    const code = (res.error as NodeJS.ErrnoException).code;
    throw new Error(code === "ENOENT" ? `command not found: ${command}` : String(res.error.message));
  }
  if (typeof res.status === "number") return { code: res.status };
  if (res.signal) return { code: 128 + (signalNumber(res.signal) || 0) };
  return { code: 1 };
}

function signalNumber(sig: NodeJS.Signals): number {
  const table: Partial<Record<NodeJS.Signals, number>> = { SIGINT: 2, SIGKILL: 9, SIGTERM: 15, SIGHUP: 1, SIGQUIT: 3 };
  return table[sig] ?? 0;
}
