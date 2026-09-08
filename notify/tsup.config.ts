import { defineConfig } from "tsup";
import { readFile, writeFile } from "node:fs/promises";

const DIRECTIVE = '"use client";\n';

export default defineConfig({
  entry: ["src/index.ts", "src/react.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  cjsInterop: true,
  minify: false,
  external: ["react"],
  // esbuild strips the module-level "use client"; re-add it to the React entry so
  // it stays a valid React Server Components client boundary.
  async onSuccess() {
    for (const file of ["dist/react.js", "dist/react.cjs"]) {
      const code = await readFile(file, "utf8").catch(() => "");
      if (code && !code.startsWith('"use client"') && !code.startsWith("'use client'")) {
        await writeFile(file, DIRECTIVE + code);
      }
    }
  },
});
