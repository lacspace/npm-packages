import { defineConfig } from "tsup";

// Two builds from one package:
//  1. dist/index.js  — the CLI bin (ESM, shebang), run by `create-lacspace-app`.
//  2. dist/lib.{js,cjs} + lib.d.ts — the programmatic library (dual ESM/CJS + types).
export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    dts: false,
    clean: true,
    sourcemap: false,
    treeshake: true,
    minify: false,
    banner: { js: "#!/usr/bin/env node" },
  },
  {
    entry: { lib: "src/lib.ts" },
    format: ["esm", "cjs"],
    dts: true,
    clean: false,
    sourcemap: false,
    treeshake: true,
    minify: false,
  },
]);
