import { defineConfig } from "tsup";
import { readFile, writeFile } from "node:fs/promises";

const DIRECTIVE = '"use client";\n';

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  cjsInterop: true,
  minify: false,
  // esbuild strips module-level directives when bundling, so re-add "use client"
  // to the emitted JS after build — this makes the whole package a valid RSC
  // client boundary (importable directly from server components).
  async onSuccess() {
    for (const file of ["dist/index.js", "dist/index.cjs"]) {
      const code = await readFile(file, "utf8");
      if (!code.startsWith('"use client"') && !code.startsWith("'use client'")) {
        await writeFile(file, DIRECTIVE + code);
      }
    }
  },
});
