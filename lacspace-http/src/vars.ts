/**
 * Variable resolution for `{{placeholders}}`, plus loaders for the two env-file
 * shapes lacspace-http understands: VS Code REST-client style
 * `http-client.env.json` and plain `.env` (KEY=VALUE) files. Everything here is
 * pure string work — no network, no `eval`.
 */
import { randomUUID } from "node:crypto";

/** A flat name→value map used to resolve `{{var}}` references. */
export type VarScope = Map<string, string>;

/** Build a scope from any number of plain objects (later objects win). */
export function makeScope(...sources: Array<Record<string, string> | undefined>): VarScope {
  const scope: VarScope = new Map();
  for (const src of sources) {
    if (!src) continue;
    for (const [k, v] of Object.entries(src)) scope.set(k, v);
  }
  return scope;
}

/** Resolve a single `{{...}}` expression. Returns undefined if unknown. */
function resolveOne(expr: string, scope: VarScope): string | undefined {
  if (scope.has(expr)) return scope.get(expr);

  if (expr.startsWith("$")) {
    const [name, ...rest] = expr.slice(1).split(/\s+/);
    switch (name) {
      case "timestamp":
        return String(Math.floor(Date.now() / 1000));
      case "isoTimestamp":
      case "datetime":
        return new Date().toISOString();
      case "guid":
      case "uuid":
        return randomUUID();
      case "randomInt": {
        const min = Number(rest[0] ?? 0);
        const max = Number(rest[1] ?? 100);
        if (Number.isNaN(min) || Number.isNaN(max) || max < min) return undefined;
        return String(min + Math.floor(Math.random() * (max - min + 1)));
      }
      case "processEnv":
      case "env": {
        const key = rest[0];
        return key ? process.env[key] : undefined;
      }
      default:
        return undefined;
    }
  }
  return undefined;
}

/** Result of {@link resolveVars}: the substituted text plus any unresolved names. */
export interface ResolveResult {
  text: string;
  missing: string[];
}

/**
 * Replace every `{{name}}` in `text` with its value from `scope` (or a built-in
 * system variable). Unknown references are left verbatim and reported in
 * `missing`, so callers can decide whether that's fatal.
 */
export function resolveVars(text: string, scope: VarScope): ResolveResult {
  const missing: string[] = [];
  const out = text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (whole, rawExpr: string) => {
    const expr = rawExpr.trim();
    const val = resolveOne(expr, scope);
    if (val === undefined) {
      missing.push(expr);
      return whole;
    }
    return val;
  });
  return { text: out, missing };
}

/**
 * Parse a REST-client `http-client.env.json` document and return the merged
 * variables for `envName`. A top-level `$shared` block (if present) is merged
 * first, then the named environment overrides it.
 */
export function parseEnvJson(json: string, envName: string): Record<string, string> {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch (err) {
    throw new Error(`Invalid env JSON: ${(err as Error).message}`);
  }
  if (typeof doc !== "object" || doc === null) {
    throw new Error("Env JSON must be an object of { envName: { key: value } }.");
  }
  const record = doc as Record<string, unknown>;
  const flatten = (block: unknown): Record<string, string> => {
    const out: Record<string, string> = {};
    if (typeof block !== "object" || block === null) return out;
    for (const [k, v] of Object.entries(block as Record<string, unknown>)) {
      out[k] = typeof v === "string" ? v : JSON.stringify(v);
    }
    return out;
  };
  const shared = flatten(record["$shared"]);
  if (!(envName in record)) {
    const names = Object.keys(record).filter((n) => n !== "$shared");
    throw new Error(`Environment "${envName}" not found. Available: ${names.join(", ") || "(none)"}`);
  }
  return { ...shared, ...flatten(record[envName]) };
}

/** Parse a `.env`-style document (KEY=VALUE lines, `#` comments, optional quotes). */
export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim().replace(/^export\s+/, "");
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

/** Parse `k=v` CLI pairs (repeatable `--var`) into a plain object. */
export function parseKvPairs(pairs: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of pairs) {
    const eq = p.indexOf("=");
    if (eq === -1) continue;
    out[p.slice(0, eq).trim()] = p.slice(eq + 1);
  }
  return out;
}
