import { defineConfig } from "tsup";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

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
    // Emit the stylesheet AFTER the bundle — `clean: true` empties dist/ first.
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["scripts/build-css.mjs", "--dist"], { stdio: "inherit" });
      child.on("error", reject);
      child.on("exit", (code) => (code === 0 ? resolve(undefined) : reject(new Error(`build-css exited ${code}`))));
    });

    for (const file of ["dist/index.js", "dist/index.cjs"]) {
      const code = await readFile(file, "utf8");
      if (!code.startsWith('"use client"') && !code.startsWith("'use client'")) {
        await writeFile(file, DIRECTIVE + code);
      }
    }
  },
});
