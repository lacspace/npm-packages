/**
 * create-lacspace-app — programmatic API.
 *
 * The same generator that powers the `create-lacspace-app` CLI, exposed as a
 * library so you can scaffold Lacspace Next.js projects from your own code:
 * build tools, custom CLIs, CI jobs, tests, playgrounds or a "download as zip"
 * button.
 *
 * ```ts
 * import { generateProject, scaffold, listTemplates } from "create-lacspace-app";
 *
 * // 1. Pure — get the whole project as an in-memory { path: contents } map.
 * const files = generateProject({ name: "acme", template: "saas", theme: "#ff6a00" });
 *
 * // 2. Write it to disk (Node only).
 * const { dir, files } = await scaffold({ name: "acme", template: "saas" });
 * ```
 *
 * `generateProject` is pure and does no I/O, so it is safe to run anywhere.
 * `scaffold` is the thin Node wrapper that writes the map to disk.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import {
  buildFiles,
  resolveContext,
  TEMPLATES,
  SECTIONS,
  FEATURES,
  type GenerateOptions,
  type TemplateDef,
  type FeatureDef,
  type FeatureBackend,
  type FeatureRoute,
} from "./index.js";

export type { GenerateOptions, TemplateDef, FeatureDef, FeatureBackend, FeatureRoute };

/** A project file map: relative path → file contents. */
export type ProjectFiles = Record<string, string>;

/** The list of built-in templates, with their metadata. */
export const templates: readonly TemplateDef[] = TEMPLATES;

/** Every template key you can pass as `options.template`. */
export const templateKeys: readonly string[] = TEMPLATES.map((t) => t.key);

/** Return the built-in templates (metadata: key, label, description, accent, defaults). */
export function listTemplates(): TemplateDef[] {
  return TEMPLATES.map((t) => ({ ...t }));
}

/** Look up one template's metadata by key, or `undefined`. */
export function getTemplate(key: string): TemplateDef | undefined {
  const t = TEMPLATES.find((x) => x.key === key);
  return t ? { ...t } : undefined;
}

/** The names of every prebuilt section available (the CLI's `add <section>`). */
export function listSections(): string[] {
  return Object.keys(SECTIONS);
}

/**
 * Return the source of one prebuilt section component (the file the CLI's
 * `add <name>` would drop into `components/sections/`), or `undefined`.
 */
export function getSection(name: string): string | undefined {
  return SECTIONS[name];
}

/**
 * The composable feature add-ons available (see {@link FeatureDef}) — the ones
 * you can pass as `options.features` or request with the CLI's `--with <key>`.
 * Returns copies, so mutating the result never affects the registry.
 */
export function listFeatures(): FeatureDef[] {
  return FEATURES.map((f) => ({ ...f }));
}

/** Look up one feature add-on's definition by key, or `undefined`. */
export function getFeature(key: string): FeatureDef | undefined {
  const f = FEATURES.find((x) => x.key === key);
  return f ? { ...f } : undefined;
}

/**
 * Generate a full project as an in-memory file map (relative path → contents).
 *
 * **Pure** — performs no disk or network I/O, so it runs the same in Node, an
 * edge runtime or a browser bundle. Use it for previews, snapshot tests, a
 * server-side zip download, or to post-process files before writing them.
 */
export function generateProject(options: GenerateOptions = {}): ProjectFiles {
  return buildFiles(resolveContext(options));
}

/** Options for {@link scaffold} — {@link GenerateOptions} plus where to write. */
export interface ScaffoldOptions extends GenerateOptions {
  /** Base directory the project folder is created under. Default `process.cwd()`. */
  cwd?: string;
  /** Write directly into this directory instead of `<cwd>/<name>`. */
  dir?: string;
}

/** What {@link scaffold} returns. */
export interface ScaffoldResult {
  /** Absolute path the project was written to. */
  dir: string;
  /** Relative paths of every file written. */
  files: string[];
}

/**
 * Generate a project and **write it to disk** (Node only).
 *
 * Writes to `options.dir` when given, otherwise to `<cwd>/<name>`. Creates
 * parent directories as needed. Does not install dependencies or init git —
 * compose those yourself, or use the CLI for the full interactive flow.
 */
export async function scaffold(options: ScaffoldOptions = {}): Promise<ScaffoldResult> {
  const ctx = resolveContext(options);
  const files = buildFiles(ctx);
  const target = options.dir
    ? resolve(options.dir)
    : resolve(options.cwd ?? process.cwd(), ctx.name);

  for (const [rel, content] of Object.entries(files)) {
    const full = join(target, rel);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content);
  }

  return { dir: target, files: Object.keys(files) };
}
