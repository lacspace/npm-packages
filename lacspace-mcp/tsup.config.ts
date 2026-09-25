import { defineConfig } from "tsup";

const external = [
  "@lacspace/email-validate", "@lacspace/email-verify", "@lacspace/webhooks",
  "lacspace-enrich", "lacspace-extract", "lacspace-inspect", "lacspace-leads", "lacspace-scraper",
];

export default defineConfig([
  { entry: { cli: "src/cli.ts" }, format: ["esm"], dts: false, clean: true, external, banner: { js: "#!/usr/bin/env node" } },
  { entry: { lib: "src/lib.ts" }, format: ["esm", "cjs"], dts: true, clean: false, external },
]);
