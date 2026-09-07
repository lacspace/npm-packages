/**
 * Optional JSON config file support for budgets and defaults, so a repo can
 * commit its size policy instead of passing long `--budget` chains in CI.
 *
 * Shape (all fields optional):
 * ```json
 * {
 *   "metric": "gzip",
 *   "max": "500kb",
 *   "budgets": { "*.js": "200kb", "*.css": "50kb" }
 * }
 * ```
 */
import { readFileSync } from "node:fs";
import { parseSize } from "./humansize.js";
import { parseBudgetSpec } from "./budget.js";
import type { Budget } from "./budget.js";
import type { Metric } from "./analyze.js";

export interface SizeConfig {
  metric?: Metric;
  /** Global total budget in bytes. */
  max?: number;
  budgets: Budget[];
}

/** Parse a config object (already-parsed JSON) into a SizeConfig. */
export function parseConfig(obj: unknown): SizeConfig {
  if (!obj || typeof obj !== "object") throw new Error("Config is not an object");
  const o = obj as Record<string, unknown>;
  const cfg: SizeConfig = { budgets: [] };
  if (typeof o.metric === "string") {
    if (!["raw", "gzip", "brotli"].includes(o.metric)) throw new Error(`Invalid config metric: "${o.metric}"`);
    cfg.metric = o.metric as Metric;
  }
  if (o.max !== undefined) cfg.max = parseSize(o.max as string | number);
  if (o.budgets !== undefined) {
    if (Array.isArray(o.budgets)) {
      // Array of "pat:size" specs.
      for (const spec of o.budgets) cfg.budgets.push(parseBudgetSpec(String(spec)));
    } else if (o.budgets && typeof o.budgets === "object") {
      // Map of pattern -> size.
      for (const [pattern, size] of Object.entries(o.budgets as Record<string, unknown>)) {
        cfg.budgets.push({ pattern, max: parseSize(size as string | number) });
      }
    } else {
      throw new Error("Config `budgets` must be an object or array");
    }
  }
  return cfg;
}

/** Read and parse a config file from disk. */
export function loadConfig(path: string): SizeConfig {
  return parseConfig(JSON.parse(readFileSync(path, "utf8")));
}
