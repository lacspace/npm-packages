import { importPkcs8, sign } from "@lacspace/jwt";
import { oidcProfile } from "./client.js";
import type { Profile, ProviderConfig, TokenEndpointAuth } from "./types.js";

/** The three things every provider needs. */
export interface Credentials {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
}

type Overrides = Partial<Omit<ProviderConfig, "id" | "clientId" | "clientSecret" | "redirectUri">>;

function str(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

function make(id: string, creds: Credentials, base: Omit<ProviderConfig, "id" | "clientId" | "clientSecret" | "redirectUri">, overrides: Overrides = {}): ProviderConfig {
  const cfg: ProviderConfig = { id, clientId: creds.clientId, redirectUri: creds.redirectUri, ...base, ...overrides };
  if (creds.clientSecret) cfg.clientSecret = creds.clientSecret;
  return cfg;
}

/** Google — OIDC, PKCE. Add `access_type: "offline"` + `prompt: "consent"` to get a refresh token. */
export function google(creds: Credentials, o: Overrides = {}): ProviderConfig {
  return make("google", creds, {
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    userinfoEndpoint: "https://openidconnect.googleapis.com/v1/userinfo",
    jwksUri: "https://www.googleapis.com/oauth2/v3/certs",
    revocationEndpoint: "https://oauth2.googleapis.com/revoke",
    issuer: (iss) => iss === "https://accounts.google.com" || iss === "accounts.google.com",
    scopes: ["openid", "email", "profile"],
    pkce: true,
  }, o);
}

/** GitHub — plain OAuth 2 (no OIDC). Falls back to /user/emails for a verified primary email. */
export function github(creds: Credentials, o: Overrides & { enterpriseUrl?: string } = {}): ProviderConfig {
  const { enterpriseUrl, ...rest } = o;
  const web = (enterpriseUrl ?? "https://github.com").replace(/\/+$/, "");
  const api = enterpriseUrl ? `${web}/api/v3` : "https://api.github.com";
  return make("github", creds, {
    authorizationEndpoint: `${web}/login/oauth/authorize`,
    tokenEndpoint: `${web}/login/oauth/access_token`,
    userinfoEndpoint: `${api}/user`,
    scopes: ["read:user", "user:email"],
    pkce: false,
    userinfoHeaders: { "user-agent": "lacspace-oauth", accept: "application/vnd.github+json" },
    async profile(raw, ctx) {
      const p: Profile = { id: String(raw["id"] ?? ""), raw };
      if (str(raw["login"])) p.username = str(raw["login"]);
      if (str(raw["name"])) p.name = str(raw["name"]);
      if (str(raw["avatar_url"])) p.picture = str(raw["avatar_url"]);
      if (str(raw["email"])) {
        p.email = str(raw["email"]);
      } else {
        try {
          const res = await ctx.fetch(`${api}/user/emails`, { headers: { authorization: `Bearer ${ctx.tokens.accessToken}`, ...ctx.config.userinfoHeaders } });
          if (res.ok) {
            const list = JSON.parse(await res.text()) as { email: string; primary?: boolean; verified?: boolean }[];
            const best = list.find((e) => e.primary && e.verified) ?? list.find((e) => e.verified) ?? list[0];
            if (best) {
              p.email = best.email;
              p.emailVerified = !!best.verified;
              p.raw = { ...raw, emails: list };
            }
          }
        } catch {
          /* email stays undefined */
        }
      }
      return p;
    },
  }, rest);
}

/** Microsoft Entra ID / personal accounts — OIDC, PKCE. `tenant`: "common" (default), "organizations", "consumers" or a tenant id. */
export function microsoft(creds: Credentials, o: Overrides & { tenant?: string } = {}): ProviderConfig {
  const { tenant = "common", ...rest } = o;
  const base = `https://login.microsoftonline.com/${tenant}`;
  const multi = ["common", "organizations", "consumers"].includes(tenant);
  return make("microsoft", creds, {
    authorizationEndpoint: `${base}/oauth2/v2.0/authorize`,
    tokenEndpoint: `${base}/oauth2/v2.0/token`,
    userinfoEndpoint: "https://graph.microsoft.com/oidc/userinfo",
    jwksUri: `${base}/discovery/v2.0/keys`,
    issuer: multi ? "https://login.microsoftonline.com/{tenantid}/v2.0" : `https://login.microsoftonline.com/${tenant}/v2.0`,
    scopes: ["openid", "profile", "email"],
    pkce: true,
  }, rest);
}

/** Sign in with Apple — OIDC, `response_mode=form_post` (Apple POSTs the callback). Profile comes from the ID token; the name arrives once in `raw.user`. */
export function apple(creds: Credentials, o: Overrides = {}): ProviderConfig {
  return make("apple", creds, {
    authorizationEndpoint: "https://appleid.apple.com/auth/authorize",
    tokenEndpoint: "https://appleid.apple.com/auth/token",
    jwksUri: "https://appleid.apple.com/auth/keys",
    revocationEndpoint: "https://appleid.apple.com/auth/revoke",
    issuer: "https://appleid.apple.com",
    scopes: ["name", "email"],
    pkce: false,
    authorizationParams: { response_mode: "form_post" },
    profile(raw, ctx) {
      const p = oidcProfile(raw);
      const u = ctx.tokens.raw["user"];
      if (typeof u === "string") {
        try {
          const parsed = JSON.parse(u) as { name?: { firstName?: string; lastName?: string }; email?: string };
          if (parsed.name?.firstName) p.givenName = parsed.name.firstName;
          if (parsed.name?.lastName) p.familyName = parsed.name.lastName;
          if (!p.name && (p.givenName || p.familyName)) p.name = [p.givenName, p.familyName].filter(Boolean).join(" ");
          if (!p.email && parsed.email) p.email = parsed.email;
          p.raw = { ...raw, user: parsed };
        } catch {
          /* ignore */
        }
      }
      if (raw["is_private_email"] === true || raw["is_private_email"] === "true") p.raw = { ...p.raw, isPrivateEmail: true };
      return p;
    },
  }, o);
}

/**
 * Apple's client secret is a JWT you sign with your Sign in with Apple key
 * (ES256, `.p8` from the developer portal). Max validity 6 months; cache it.
 */
export async function createAppleClientSecret(opts: { teamId: string; clientId: string; keyId: string; privateKey: string; expiresIn?: number }): Promise<string> {
  const key = await importPkcs8(opts.privateKey, "ES256");
  return sign({}, key, { algorithm: "ES256", keyId: opts.keyId, issuer: opts.teamId, subject: opts.clientId, audience: "https://appleid.apple.com", expiresIn: Math.min(opts.expiresIn ?? 15777000, 15777000) });
}

/** GitLab — OIDC, PKCE. `baseUrl` for self-hosted. */
export function gitlab(creds: Credentials, o: Overrides & { baseUrl?: string } = {}): ProviderConfig {
  const { baseUrl = "https://gitlab.com", ...rest } = o;
  const b = baseUrl.replace(/\/+$/, "");
  return make("gitlab", creds, {
    authorizationEndpoint: `${b}/oauth/authorize`,
    tokenEndpoint: `${b}/oauth/token`,
    userinfoEndpoint: `${b}/oauth/userinfo`,
    jwksUri: `${b}/oauth/discovery/keys`,
    revocationEndpoint: `${b}/oauth/revoke`,
    issuer: b,
    scopes: ["openid", "profile", "email"],
    pkce: true,
  }, rest);
}

/** Discord — OAuth 2, PKCE. */
export function discord(creds: Credentials, o: Overrides = {}): ProviderConfig {
  return make("discord", creds, {
    authorizationEndpoint: "https://discord.com/oauth2/authorize",
    tokenEndpoint: "https://discord.com/api/oauth2/token",
    userinfoEndpoint: "https://discord.com/api/users/@me",
    revocationEndpoint: "https://discord.com/api/oauth2/token/revoke",
    scopes: ["identify", "email"],
    pkce: true,
    profile(raw) {
      const p: Profile = { id: String(raw["id"] ?? ""), raw };
      if (str(raw["username"])) p.username = str(raw["username"]);
      p.name = str(raw["global_name"]) ?? str(raw["username"]);
      if (str(raw["email"])) p.email = str(raw["email"]);
      if (raw["verified"] !== undefined) p.emailVerified = raw["verified"] === true;
      if (str(raw["avatar"]) && p.id) p.picture = `https://cdn.discordapp.com/avatars/${p.id}/${raw["avatar"]}.png`;
      if (str(raw["locale"])) p.locale = str(raw["locale"]);
      return p;
    },
  }, o);
}

/** Slack — "Sign in with Slack" (OIDC). */
export function slack(creds: Credentials, o: Overrides = {}): ProviderConfig {
  return make("slack", creds, {
    authorizationEndpoint: "https://slack.com/openid/connect/authorize",
    tokenEndpoint: "https://slack.com/api/openid.connect.token",
    userinfoEndpoint: "https://slack.com/api/openid.connect.userInfo",
    jwksUri: "https://slack.com/openid/connect/keys",
    issuer: "https://slack.com",
    scopes: ["openid", "profile", "email"],
    pkce: false,
  }, o);
}

/** LinkedIn — "Sign In with LinkedIn using OpenID Connect". */
export function linkedin(creds: Credentials, o: Overrides = {}): ProviderConfig {
  return make("linkedin", creds, {
    authorizationEndpoint: "https://www.linkedin.com/oauth/v2/authorization",
    tokenEndpoint: "https://www.linkedin.com/oauth/v2/accessToken",
    userinfoEndpoint: "https://api.linkedin.com/v2/userinfo",
    jwksUri: "https://www.linkedin.com/oauth/openid/jwks",
    issuer: "https://www.linkedin.com/oauth",
    scopes: ["openid", "profile", "email"],
    pkce: false,
  }, o);
}

/** Facebook Login — OAuth 2 over the Graph API. `version` default "v19.0". */
export function facebook(creds: Credentials, o: Overrides & { version?: string; fields?: string[] } = {}): ProviderConfig {
  const { version = "v19.0", fields = ["id", "name", "email", "picture", "first_name", "last_name"], ...rest } = o;
  return make("facebook", creds, {
    authorizationEndpoint: `https://www.facebook.com/${version}/dialog/oauth`,
    tokenEndpoint: `https://graph.facebook.com/${version}/oauth/access_token`,
    userinfoEndpoint: `https://graph.facebook.com/${version}/me?fields=${encodeURIComponent(fields.join(","))}`,
    scopes: ["email", "public_profile"],
    pkce: false,
    profile(raw) {
      const p: Profile = { id: String(raw["id"] ?? ""), raw };
      if (str(raw["name"])) p.name = str(raw["name"]);
      if (str(raw["email"])) p.email = str(raw["email"]);
      if (str(raw["first_name"])) p.givenName = str(raw["first_name"]);
      if (str(raw["last_name"])) p.familyName = str(raw["last_name"]);
      const pic = (raw["picture"] as { data?: { url?: string } } | undefined)?.data?.url;
      if (pic) p.picture = pic;
      return p;
    },
  }, rest);
}

/** X (Twitter) — OAuth 2 with mandatory PKCE; confidential clients use client_secret_basic. No email. */
export function x(creds: Credentials, o: Overrides = {}): ProviderConfig {
  return make("x", creds, {
    authorizationEndpoint: "https://x.com/i/oauth2/authorize",
    tokenEndpoint: "https://api.x.com/2/oauth2/token",
    userinfoEndpoint: "https://api.x.com/2/users/me?user.fields=profile_image_url,name,username",
    revocationEndpoint: "https://api.x.com/2/oauth2/revoke",
    scopes: ["users.read", "tweet.read", "offline.access"],
    pkce: true,
    tokenEndpointAuth: (creds.clientSecret ? "client_secret_basic" : "none") as TokenEndpointAuth,
    profile(raw) {
      const d = (raw["data"] as Record<string, unknown> | undefined) ?? raw;
      const p: Profile = { id: String(d["id"] ?? ""), raw };
      if (str(d["username"])) p.username = str(d["username"]);
      if (str(d["name"])) p.name = str(d["name"]);
      if (str(d["profile_image_url"])) p.picture = str(d["profile_image_url"]);
      return p;
    },
  }, o);
}

/** Spotify — OAuth 2, PKCE, client_secret_basic. */
export function spotify(creds: Credentials, o: Overrides = {}): ProviderConfig {
  return make("spotify", creds, {
    authorizationEndpoint: "https://accounts.spotify.com/authorize",
    tokenEndpoint: "https://accounts.spotify.com/api/token",
    userinfoEndpoint: "https://api.spotify.com/v1/me",
    scopes: ["user-read-email", "user-read-private"],
    pkce: true,
    tokenEndpointAuth: (creds.clientSecret ? "client_secret_basic" : "none") as TokenEndpointAuth,
    profile(raw) {
      const p: Profile = { id: String(raw["id"] ?? ""), raw };
      if (str(raw["display_name"])) p.name = str(raw["display_name"]);
      if (str(raw["email"])) p.email = str(raw["email"]);
      const img = (raw["images"] as { url?: string }[] | undefined)?.[0]?.url;
      if (img) p.picture = img;
      if (str(raw["country"])) p.locale = str(raw["country"]);
      return p;
    },
  }, o);
}

/** Twitch — OIDC. Requests email + username claims in userinfo. */
export function twitch(creds: Credentials, o: Overrides = {}): ProviderConfig {
  return make("twitch", creds, {
    authorizationEndpoint: "https://id.twitch.tv/oauth2/authorize",
    tokenEndpoint: "https://id.twitch.tv/oauth2/token",
    userinfoEndpoint: "https://id.twitch.tv/oauth2/userinfo",
    jwksUri: "https://id.twitch.tv/oauth2/keys",
    issuer: "https://id.twitch.tv/oauth2",
    scopes: ["openid", "user:read:email"],
    pkce: false,
    authorizationParams: { claims: JSON.stringify({ userinfo: { email: null, email_verified: null, preferred_username: null, picture: null } }) },
  }, o);
}

/** Notion — OAuth 2, client_secret_basic, `owner=user`. Profile comes from the token response. */
export function notion(creds: Credentials, o: Overrides = {}): ProviderConfig {
  return make("notion", creds, {
    authorizationEndpoint: "https://api.notion.com/v1/oauth/authorize",
    tokenEndpoint: "https://api.notion.com/v1/oauth/token",
    pkce: false,
    tokenEndpointAuth: "client_secret_basic",
    authorizationParams: { owner: "user" },
    profile(raw) {
      const user = ((raw["owner"] as { user?: Record<string, unknown> } | undefined)?.user ?? {}) as Record<string, unknown>;
      const p: Profile = { id: String(user["id"] ?? raw["bot_id"] ?? ""), raw };
      if (str(user["name"])) p.name = str(user["name"]);
      if (str(user["avatar_url"])) p.picture = str(user["avatar_url"]);
      const email = (user["person"] as { email?: string } | undefined)?.email;
      if (email) p.email = email;
      return p;
    },
  }, o);
}

/** Any OpenID Connect issuer with discovery — Auth0, Okta, Keycloak, Cognito, Zitadel, Authentik, Dex, Google Workspace… */
export function oidc(creds: Credentials & { issuer: string; id?: string }, o: Overrides = {}): ProviderConfig {
  const { issuer, id = "oidc", ...c } = creds;
  return make(id, c, {
    discover: issuer,
    authorizationEndpoint: "",
    tokenEndpoint: "",
    scopes: ["openid", "profile", "email"],
  }, o);
}

export function auth0(creds: Credentials & { domain: string }, o: Overrides = {}): ProviderConfig {
  const { domain, ...c } = creds;
  return oidc({ ...c, id: "auth0", issuer: `https://${domain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}/` }, o);
}

/** Okta — pass the org domain; `authorizationServer` defaults to the org server ("" = org, "default" = /oauth2/default). */
export function okta(creds: Credentials & { domain: string; authorizationServer?: string }, o: Overrides = {}): ProviderConfig {
  const { domain, authorizationServer, ...c } = creds;
  const base = `https://${domain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return oidc({ ...c, id: "okta", issuer: authorizationServer ? `${base}/oauth2/${authorizationServer}` : base }, o);
}

export function keycloak(creds: Credentials & { baseUrl: string; realm: string }, o: Overrides = {}): ProviderConfig {
  const { baseUrl, realm, ...c } = creds;
  return oidc({ ...c, id: "keycloak", issuer: `${baseUrl.replace(/\/+$/, "")}/realms/${encodeURIComponent(realm)}` }, o);
}

export function cognito(creds: Credentials & { region: string; userPoolId: string }, o: Overrides = {}): ProviderConfig {
  const { region, userPoolId, ...c } = creds;
  return oidc({ ...c, id: "cognito", issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}` }, o);
}

/** A plain OAuth 2 provider you describe yourself. */
export function oauth2(creds: Credentials & { id?: string; authorizationEndpoint: string; tokenEndpoint: string }, o: Overrides = {}): ProviderConfig {
  const { id = "oauth2", authorizationEndpoint, tokenEndpoint, ...c } = creds;
  return make(id, c, { authorizationEndpoint, tokenEndpoint, pkce: true }, o);
}

/** Every preset by id, for `providers[name](creds)` lookups. */
export const providers = { google, github, microsoft, apple, gitlab, discord, slack, linkedin, facebook, x, spotify, twitch, notion, auth0, okta, keycloak, cognito } as const;
export type ProviderName = keyof typeof providers;
