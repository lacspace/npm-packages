/**
 * Custom commit-type configuration. A project drops a `.changelogrc.json` at
 * its root to remap commit types → section titles, decide which types bump the
 * version (and how), and hide noise. The pure `configTo*` transforms turn a
 * config object into the `groups` / `hiddenTypes` / bump options that
 * {@link renderSection} and {@link recommendBump} already understand — so they
 * are testable without touching the filesystem. `loadConfig` is the thin fs
 * wrapper the CLI uses.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { CommitGroup } from "./changelog.js";
import type { BumpOptions } from "./bump.js";

/** How a single commit type is treated. */
export interface TypeConfig {
  /** The section heading this type is grouped under, e.g. "Features". */
  section?: string;
  /** The bump this type contributes: `major` | `minor` | `patch` | `none`. */
  bump?: "major" | "minor" | "patch" | "none";
  /** Hide this type from the rendered changelog (it still counts for the bump). */
  hidden?: boolean;
}

/** The `.changelogrc.json` shape. Every field is optional. */
export interface ChangelogConfig {
  /** Per-type overrides, keyed by commit type (feat, fix, …). */
  types?: Record<string, TypeConfig>;
  /** Extra types to hide, merged with any `hidden: true` in `types`. */
  hiddenTypes?: string[];
  /** Bucket non-conventional commits under "Other Changes". Default true. */
  includeOther?: boolean;
  /** Append a Contributors section. Default false. */
  contributors?: boolean;
  /** Override the repo URL used for links. */
  repoUrl?: string;
  /** In `0.x`, treat a breaking change as minor. Default true. */
  pre1BreakingIsMinor?: boolean;
}

/** The config filenames looked up, in priority order. */
export const CONFIG_FILENAMES = [".changelogrc.json", ".changelogrc"] as const;

/**
 * Turn a config into ordered {@link CommitGroup}s. Types that name the same
 * `section` are merged into one group, preserving first-seen order.
 */
export function configToGroups(config: ChangelogConfig): CommitGroup[] {
  const types = config.types ?? {};
  const order: string[] = [];
  const byTitle = new Map<string, CommitGroup>();
  for (const [type, tc] of Object.entries(types)) {
    const title = tc.section;
    if (!title) continue;
    let g = byTitle.get(title);
    if (!g) {
      g = { title, types: [] };
      byTitle.set(title, g);
      order.push(title);
    }
    if (!g.types.includes(type)) g.types.push(type);
  }
  return order.map((t) => byTitle.get(t)!);
}

/** Collect the hidden types: `hidden: true` entries plus explicit `hiddenTypes`. */
export function configToHidden(config: ChangelogConfig): string[] {
  const hidden = new Set<string>(config.hiddenTypes ?? []);
  for (const [type, tc] of Object.entries(config.types ?? {})) {
    if (tc.hidden) hidden.add(type);
  }
  return [...hidden];
}

/**
 * Derive {@link BumpOptions} from a config's per-type `bump` levels. Types with
 * `bump: "minor"` become `minorTypes`, `"patch"` → `patchTypes`, `"major"` →
 * `majorTypes`. Only emitted when at least one type declares a bump, so a
 * config that only remaps sections leaves the default bump rules intact.
 */
export function configToBumpOptions(config: ChangelogConfig): BumpOptions {
  const minorTypes: string[] = [];
  const patchTypes: string[] = [];
  const majorTypes: string[] = [];
  for (const [type, tc] of Object.entries(config.types ?? {})) {
    if (tc.bump === "minor") minorTypes.push(type);
    else if (tc.bump === "patch") patchTypes.push(type);
    else if (tc.bump === "major") majorTypes.push(type);
  }
  const opts: BumpOptions = {};
  if (minorTypes.length) opts.minorTypes = minorTypes;
  if (patchTypes.length) opts.patchTypes = patchTypes;
  if (majorTypes.length) opts.majorTypes = majorTypes;
  if (config.pre1BreakingIsMinor !== undefined) {
    opts.pre1BreakingIsMinor = config.pre1BreakingIsMinor;
  }
  return opts;
}

/** The pure resolution of a config into everything the renderer/bumper need. */
export interface ResolvedConfig {
  groups?: CommitGroup[];
  hiddenTypes?: string[];
  bumpOptions: BumpOptions;
  includeOther?: boolean;
  contributors?: boolean;
  repoUrl?: string;
}

/** Resolve a config object into render/bump inputs. Pure. */
export function resolveConfig(config: ChangelogConfig): ResolvedConfig {
  const groups = configToGroups(config);
  const hiddenTypes = configToHidden(config);
  const resolved: ResolvedConfig = { bumpOptions: configToBumpOptions(config) };
  if (groups.length) resolved.groups = groups;
  if (hiddenTypes.length || config.hiddenTypes) resolved.hiddenTypes = hiddenTypes;
  if (config.includeOther !== undefined) resolved.includeOther = config.includeOther;
  if (config.contributors !== undefined) resolved.contributors = config.contributors;
  if (config.repoUrl !== undefined) resolved.repoUrl = config.repoUrl;
  return resolved;
}

/** Parse config JSON text into a {@link ChangelogConfig}. Throws on bad JSON. */
export function parseConfig(text: string): ChangelogConfig {
  const json = JSON.parse(text) as ChangelogConfig;
  if (json === null || typeof json !== "object") {
    throw new Error("changelog config must be a JSON object");
  }
  return json;
}

/**
 * Load a config file. When `pathOrDir` is a directory (default cwd), the known
 * {@link CONFIG_FILENAMES} are tried in order; when it's an explicit file, that
 * file is read. Returns null when nothing is found.
 */
export function loadConfig(pathOrDir: string = process.cwd()): ChangelogConfig | null {
  const candidates: string[] = [];
  if (existsSync(pathOrDir) && statSync(pathOrDir).isDirectory()) {
    for (const f of CONFIG_FILENAMES) candidates.push(join(pathOrDir, f));
  } else {
    candidates.push(pathOrDir);
  }
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return parseConfig(readFileSync(p, "utf8"));
      } catch {
        return null;
      }
    }
  }
  return null;
}
