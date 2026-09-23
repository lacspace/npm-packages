/**
 * The stylesheet is authored as parts in src/styles/*.css — one file per
 * component family, so several people (or agents) can work at once without
 * fighting over a single file. They are concatenated in filename order, which
 * is why the files are numbered: 00-base.css defines the tokens everything
 * else refers to.
 *
 * It ships two ways:
 *   1. dist/styles.css — a normal stylesheet for an app with a CSS pipeline.
 *   2. src/css.generated.ts — the same text as a string, so <LacspaceStyles />
 *      can inject it where CSS imports are not possible.
 * One source, so the file and its JS copy can never drift.
 */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "src/styles");

const files = (await readdir(dir)).filter((f) => f.endsWith(".css")).sort();
const parts = [];
for (const file of files) {
  parts.push(`/* ---- ${file} ---- */\n${await readFile(join(dir, file), "utf8")}`);
}
const css = parts.join("\n");

const banner = "// GENERATED FILE — edit src/styles/*.css instead. Rebuilt by scripts/build-css.mjs.\n";
await writeFile(
  join(root, "src/css.generated.ts"),
  `${banner}\n/** The component stylesheet, as a string. */\nexport const CSS: string = ${JSON.stringify(css)};\n`,
);

// dist/styles.css is written ONLY with --dist, which tsup runs in onSuccess.
// Writing it before the bundle would be pointless: tsup's `clean` wipes dist/
// first, and the published package would ship without its stylesheet.
if (process.argv.includes("--dist")) {
  await mkdir(join(root, "dist"), { recursive: true });
  await writeFile(join(root, "dist/styles.css"), css);
  console.log(`${files.length} css parts → dist/styles.css (${css.length} bytes)`);
} else {
  console.log(`${files.length} css parts → src/css.generated.ts (${css.length} bytes)`);
}
