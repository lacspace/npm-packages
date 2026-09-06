import { defineConfig } from "tsup";

// Two builds:
//  1. dist/cli.js — the `lacspace-leads` bin (ESM, shebang).
//  2. dist/lib.{js,cjs} + lib.d.ts — the programmatic library (dual + types).
// playwright-core is a heavy peer of the runtime and is kept external.
export default defineConfig([
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    dts: false,
    clean: true,
    sourcemap: false,
    minify: false,
    external: ["playwright-core", "@lacspace/csv", "@lacspace/xlsx"],
    banner: { js: "#!/usr/bin/env node" },
  },
  {
    entry: { lib: "src/lib.ts" },
    format: ["esm", "cjs"],
    dts: true,
    clean: false,
    sourcemap: false,
    minify: false,
    external: ["playwright-core", "@lacspace/csv", "@lacspace/xlsx"],
  },
]);
