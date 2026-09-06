import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    dts: false,
    clean: true,
    external: ["lacspace-scraper"],
    banner: { js: "#!/usr/bin/env node" },
  },
  {
    entry: { lib: "src/lib.ts" },
    format: ["esm", "cjs"],
    dts: true,
    clean: false,
    external: ["lacspace-scraper"],
  },
]);
