/**
 * Compare several environments (`.env.development`, `.env.staging`,
 * `.env.production`, …) key-by-key to spot keys that exist in one environment
 * but are missing from another — the classic "works locally, 500s in prod
 * because `STRIPE_KEY` was never set there" bug.
 */

/** One named environment: a label plus its parsed key → value map. */
export interface NamedEnv {
  name: string;
  map: Record<string, string>;
}

/** The result of {@link envMatrix}. */
export interface EnvMatrix {
  /** Environment names, in the order supplied. */
  envs: string[];
  /** The union of every key across all environments, sorted. */
  keys: string[];
  /** `present[key][envName]` — whether that key is defined in that environment. */
  present: Record<string, Record<string, boolean>>;
  /** `missing[envName]` — keys that other environments have but this one lacks. */
  missing: Record<string, string[]>;
  /** Keys defined in every environment. */
  common: string[];
}

/** Build a presence matrix across the given environments. */
export function envMatrix(envs: NamedEnv[]): EnvMatrix {
  const names = envs.map((e) => e.name);
  const keySet = new Set<string>();
  for (const e of envs) for (const k of Object.keys(e.map)) keySet.add(k);
  const keys = [...keySet].sort();

  const present: Record<string, Record<string, boolean>> = {};
  const missing: Record<string, string[]> = {};
  for (const n of names) missing[n] = [];
  const common: string[] = [];

  for (const key of keys) {
    present[key] = {};
    let inAll = true;
    for (const e of envs) {
      const has = Object.prototype.hasOwnProperty.call(e.map, key);
      present[key]![e.name] = has;
      if (!has) {
        missing[e.name]!.push(key);
        inAll = false;
      }
    }
    if (inAll) common.push(key);
  }

  return { envs: names, keys, present, missing, common };
}
