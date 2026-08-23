import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true, clean: true, sourcemap: true, treeshake: true, cjsInterop: true, minify: false,
  external: ["react", "react-dom", "react/jsx-runtime"],
});
