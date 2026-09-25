// Runs only with LIVE=1: asserts every preset still matches the provider's own discovery document.
import { describe, expect, it } from "vitest";
import { discover, gitlab, google, linkedin, microsoft, slack, twitch, apple } from "./index.js";

const creds = { clientId: "id", redirectUri: "https://app.test/cb" };
const live = process.env["LIVE"] === "1" ? describe : describe.skip;

live("presets vs live discovery", () => {
  const cases: [string, string, ReturnType<typeof google>][] = [
    ["google", "https://accounts.google.com", google(creds)],
    ["microsoft", "https://login.microsoftonline.com/common/v2.0", microsoft(creds)],
    ["apple", "https://appleid.apple.com", apple(creds)],
    ["gitlab", "https://gitlab.com", gitlab(creds)],
    ["slack", "https://slack.com", slack(creds)],
    ["linkedin", "https://www.linkedin.com/oauth", linkedin(creds)],
    ["twitch", "https://id.twitch.tv/oauth2", twitch(creds)],
  ];
  for (const [name, issuer, cfg] of cases) {
    it(name, async () => {
      const d = await discover(issuer, { fetch: fetch as never, requireIssuerMatch: false });
      expect(d.authorization_endpoint).toBe(cfg.authorizationEndpoint);
      expect(d.token_endpoint).toBe(cfg.tokenEndpoint);
      if (cfg.jwksUri) expect(d.jwks_uri).toBe(cfg.jwksUri);
      if (cfg.userinfoEndpoint) expect(d.userinfo_endpoint).toBe(cfg.userinfoEndpoint);
      if (d.code_challenge_methods_supported) expect(d.code_challenge_methods_supported.includes("S256")).toBe(cfg.pkce !== false || name === "apple" || name === "microsoft");
    }, 20000);
  }
});
