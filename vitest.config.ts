import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/src/**/*.test.ts"],
    // lacspace-leads lives in this repo but is NOT a zero-dep workspace member
    // (it needs Playwright); it builds + tests independently from its own folder.
    exclude: ["**/dist/**", "**/node_modules/**", "lacspace-leads/**", "lacspace-scraper/**", "lacspace-monitor/**", "lacspace-enrich/**", "lacspace-extract/**", "lacspace-sql/**", "lacspace-inspect/**", "lacspace-dotenv/**", "lacspace-webhook/**", "lacspace-har/**", "lacspace-cron/**", "lacspace-icon/**", "lacspace-http/**", "lacspace-fake/**", "lacspace-deps/**", "lacspace-json/**", "lacspace-qr/**", "lacspace-svg/**", "lacspace-i18n/**", "lacspace-changelog/**", "lacspace-mock/**", "lacspace-size/**", "lacspace-schema/**", "lacspace-license/**", "lacspace-rag/**"],
    environment: "node",
  },
});
