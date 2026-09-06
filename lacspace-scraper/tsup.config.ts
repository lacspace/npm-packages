import { defineConfig } from "tsup";

// Two builds, mirroring the rest of the Lacspace CLIs:
//  1. dist/cli.js — the `lacspace-scraper` bin (ESM, shebang).
//  2. dist/lib.{js,cjs} + lib.d.ts — the programmatic library (dual + types).
// playwright-core is an OPTIONAL peer (browser mode only) and stays external.
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
