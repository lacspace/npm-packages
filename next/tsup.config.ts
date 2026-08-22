import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  cjsInterop: true,
  minify: false,
  external: ["next", "next/headers", "next/server", "react", "@lacspace/sdk"],
});
