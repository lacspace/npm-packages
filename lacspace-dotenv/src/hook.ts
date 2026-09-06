/**
 * Install a git `pre-commit` hook that runs `lacspace-dotenv lint --deny-secrets`
 * on any staged `.env`-family file and blocks the commit if a secret (or a
 * syntax error) is found. The hook body is a pure string ({@link hookScript}) so
 * it can be tested without touching the filesystem; {@link installHook} writes it.
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync, statSync, chmodSync } from "node:fs";
import { join } from "node:path";

/** Marker line so we recognise (and can safely overwrite) our own hook. */
export const HOOK_MARKER = "# lacspace-dotenv pre-commit hook";

/** The POSIX-sh source of the pre-commit hook. */
export function hookScript(): string {
  return [
    "#!/bin/sh",
    HOOK_MARKER,
    "# Blocks a commit that stages a .env file containing secrets or syntax errors.",
    "# Regenerate with: npx lacspace-dotenv install-hook --force",
    "set -e",
    "",
    "staged=$(git diff --cached --name-only --diff-filter=ACM \\",
    "  | grep -E '(^|/)\\.env' \\",
    "  | grep -vE '\\.(example|sample|enc)$' || true)",
    '[ -z "$staged" ] && exit 0',
    "",
    "status=0",
    'for file in $staged; do',
    '  [ -f "$file" ] || continue',
    '  npx --no-install lacspace-dotenv lint --deny-secrets "$file" || status=1',
    "done",
    "",
    'if [ "$status" -ne 0 ]; then',
    '  echo "" >&2',
    '  echo "✗ lacspace-dotenv blocked this commit (secret or syntax error in a staged .env)." >&2',
    '  echo "  Fix the findings above, or commit with --no-verify to override." >&2',
    "fi",
    'exit "$status"',
    "",
  ].join("\n");
}

/** The result of {@link installHook}. */
export interface InstallHookResult {
  /** Absolute path of the hook that was written. */
  path: string;
  /** `true` if an existing non-lacspace hook was overwritten (only with `force`). */
  replaced: boolean;
}

/** Options for {@link installHook}. */
export interface InstallHookOptions {
  /** Repository root (contains `.git`). Default: current working directory. */
  cwd?: string;
  /** Overwrite an existing hook that is not ours. Default `false`. */
  force?: boolean;
}

/**
 * Write the pre-commit hook into `<cwd>/.git/hooks/pre-commit` and mark it
 * executable. Refuses to clobber a pre-existing hook that we did not write
 * unless `force` is set. Throws if there is no `.git` directory.
 */
export function installHook(opts: InstallHookOptions = {}): InstallHookResult {
  const cwd = opts.cwd ?? process.cwd();
  const gitDir = join(cwd, ".git");
  if (!existsSync(gitDir)) throw new Error(`no .git directory found in ${cwd} — run inside a git repository`);

  const hooksDir = join(gitDir, "hooks");
  const hookPath = join(hooksDir, "pre-commit");
  let replaced = false;

  if (existsSync(hookPath)) {
    const current = readFileSync(hookPath, "utf8");
    if (!current.includes(HOOK_MARKER)) {
      if (!opts.force) {
        throw new Error(`a pre-commit hook already exists at ${hookPath} — re-run with --force to replace it`);
      }
      replaced = true;
    }
  }

  mkdirSync(hooksDir, { recursive: true });
  writeFileSync(hookPath, hookScript(), "utf8");
  chmodSync(hookPath, (statSync(hookPath).mode & 0o777) | 0o755);
  return { path: hookPath, replaced };
}
