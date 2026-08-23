import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  sourcemap: false,
  treeshake: true,
  minify: false,
  banner: { js: "#!/usr/bin/env node" },
});
