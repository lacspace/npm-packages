import { defineConfig } from "tsup";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const DIRECTIVE = '"use client";\n';

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  cjsInterop: true,
  minify: false,
  external: ["react", "react-dom", "react/jsx-runtime"],
  // esbuild strips module-level directives when bundling, so re-add "use client"
  // to the emitted JS after build — this makes the whole package a valid RSC
  // client boundary (importable directly from server components).
  async onSuccess() {
    // `clean: true` wipes dist *after* the prebuild step wrote dist/styles.css
    // into it, so the stylesheet the "./styles.css" export points at has to be
    // written again here. Cheap, and it keeps a published package from
    // shipping an export that 404s.
    execFileSync(process.execPath, ["scripts/build-css.mjs"], { stdio: "inherit" });

    for (const file of ["dist/index.js", "dist/index.cjs"]) {
      const code = await readFile(file, "utf8");
      if (!code.startsWith('"use client"') && !code.startsWith("'use client'")) {
        await writeFile(file, DIRECTIVE + code);
      }
    }
  },
});
