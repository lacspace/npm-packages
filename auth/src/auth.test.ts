import { test, expect } from "vitest";
import {
  LacspaceAuth,
  memoryTokenStorage,
  decodeJwt,
  getTokenExpiry,
  isTokenExpired,
  tokenTimeToLive,
  refreshDelayMs,
  bearerHeader,
  basicHeader,
  parseScopes,
  hasScope,
  hasAllScopes,
  hasAnyScope,
  getUserRoles,
  hasRole,
  hasAnyRole,
  hasAllRoles,
  randomString,
  generateState,
  createPkcePair,
  codeChallengeS256,
  buildAuthorizeUrl,
  parseAuthCallback,
  encodeAuthMessage,
  decodeAuthMessage,
} from "./index";

// Build a JWT with the given payload (no signature) using only web-standard base64.
function makeJwt(payload: Record<string, unknown>): string {
  const b64url = (obj: Record<string, unknown>): string => {
    const json = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(json);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.sig`;
}

// A canned fetch that routes by path, so we exercise the real api client
// (@lacspace/api) end-to-end without any network.
function fakeFetch(canned: Record<string, unknown>): typeof fetch {
  return (async (input: string | URL | Request): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const path = Object.keys(canned).find((p) => url.includes(p));
    const body = path ? canned[path] : {};
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

test("login stores the token, sets the user and notifies subscribers", async () => {
  const auth = new LacspaceAuth({
    baseURL: "http://api.test",
    fetch: fakeFetch({
      "auth/login": { token: "tok-123", user: { id: "u1", username: "ada" } },
    }),
    storage: memoryTokenStorage(),
  });

  const seen: (unknown | null)[] = [];
  auth.subscribe((u) => seen.push(u));

  const result = await auth.login({ username: "ada", password: "pw" });
  expect(result.token).toBe("tok-123");
  expect(auth.getToken()).toBe("tok-123");
  expect(auth.user?.id).toBe("u1");
  expect(seen.length).toBeGreaterThan(0);
  expect((seen[seen.length - 1] as { id: string }).id).toBe("u1");
});

test("logout clears the token, user and notifies", async () => {
  const auth = new LacspaceAuth({
    baseURL: "http://api.test",
    fetch: fakeFetch({
      "auth/login": { token: "tok-123", user: { id: "u1" } },
      "auth/logout": {},
    }),
  });
  await auth.login({ username: "ada", password: "pw" });
  expect(auth.getToken()).toBe("tok-123");

  let lastUser: unknown = "unset";
  auth.subscribe((u) => (lastUser = u));
  await auth.logout();
  expect(auth.user).toBe(null);
  expect(lastUser).toBe(null);
  expect(auth.getToken() || undefined).toBeUndefined();
});

test("in-memory token storage round-trips and unsubscribe stops notifications", async () => {
  const storage = memoryTokenStorage();
  await storage.set("abc");
  expect(await storage.get()).toBe("abc");
  await storage.clear();
  expect(await storage.get() || undefined).toBeUndefined();

  const auth = new LacspaceAuth({
    baseURL: "http://api.test",
    fetch: fakeFetch({ "auth/login": { token: "t", user: { id: "x" } } }),
  });
  let count = 0;
  const off = auth.subscribe(() => count++);
  await auth.login({ username: "a", password: "b" });
  const afterFirst = count;
  expect(afterFirst).toBeGreaterThan(0);
  off();
  await auth.login({ username: "a", password: "b" });
  expect(count).toBe(afterFirst); // no further notifications after unsubscribe
});

/* ---- New in 2.2: pure, IO-injected utilities ---- */

test("decodeJwt reads the payload and getTokenExpiry converts exp to ms", () => {
  const token = makeJwt({ sub: "u1", exp: 1_700_000_000 });
  expect(decodeJwt<{ sub: string }>(token)?.sub).toBe("u1");
  expect(getTokenExpiry(token)).toBe(1_700_000_000_000);
  expect(decodeJwt("not-a-jwt")).toBe(null);
  expect(getTokenExpiry("nope")).toBe(null);
});

test("isTokenExpired uses an injected clock and leeway", () => {
  const token = makeJwt({ exp: 1000 }); // expires at 1_000_000 ms
  expect(isTokenExpired(token, { clock: () => 999_000 })).toBe(false);
  expect(isTokenExpired(token, { clock: () => 1_000_001 })).toBe(true);
  // leeway makes it expire early
  expect(isTokenExpired(token, { clock: () => 995_000, leewaySec: 10 })).toBe(true);
  // no exp claim → never expired
  expect(isTokenExpired(makeJwt({ sub: "x" }), { clock: () => 9e15 })).toBe(false);
});

test("tokenTimeToLive returns clamped remaining ms via injected clock", () => {
  const token = makeJwt({ exp: 2000 }); // 2_000_000 ms
  expect(tokenTimeToLive(token, { clock: () => 1_500_000 })).toBe(500_000);
  expect(tokenTimeToLive(token, { clock: () => 3_000_000 })).toBe(0);
  expect(tokenTimeToLive(makeJwt({}), { clock: () => 0 })).toBe(null);
});

test("refreshDelayMs computes exp - skew - now, clamped, with injected clock", () => {
  const token = makeJwt({ exp: 1000 }); // 1_000_000 ms
  expect(refreshDelayMs(token, { clock: () => 900_000, skewSec: 30 })).toBe(70_000);
  // past the skew window → clamped to min (0 by default)
  expect(refreshDelayMs(token, { clock: () => 999_999, skewSec: 30 })).toBe(0);
  // maxMs clamp
  expect(refreshDelayMs(token, { clock: () => 0, skewSec: 0, maxMs: 5000 })).toBe(5000);
  expect(refreshDelayMs(makeJwt({}), {})).toBe(null);
});

test("bearerHeader and basicHeader build Authorization headers (encoder injectable)", () => {
  expect(bearerHeader("abc")).toEqual({ Authorization: "Bearer abc" });
  expect(basicHeader("u", "p", { encode: (s) => `enc(${s})` })).toEqual({
    Authorization: "Basic enc(u:p)",
  });
  // default encoder yields real base64 of "u:p"
  expect(basicHeader("u", "p").Authorization).toBe("Basic dTpw");
});

test("scope helpers parse and match granted scopes", () => {
  expect(parseScopes("read write   delete")).toEqual(["read", "write", "delete"]);
  expect(parseScopes(["a", "b"])).toEqual(["a", "b"]);
  expect(parseScopes(null)).toEqual([]);
  expect(hasScope("read write", "write")).toBe(true);
  expect(hasScope("read", "write")).toBe(false);
  expect(hasAllScopes("read write", ["read", "write"])).toBe(true);
  expect(hasAllScopes("read", ["read", "write"])).toBe(false);
  expect(hasAnyScope("read", ["read", "write"])).toBe(true);
  expect(hasAnyScope("x", ["read", "write"])).toBe(false);
});

test("role helpers read roles/role or a custom claim", () => {
  expect(getUserRoles({ id: "1", roles: ["admin", "editor"] })).toEqual(["admin", "editor"]);
  expect(getUserRoles({ id: "1", role: "viewer" })).toEqual(["viewer"]);
  expect(getUserRoles({ id: "1", perms: "a b" }, { roleClaim: "perms" })).toEqual(["a", "b"]);
  expect(hasRole({ id: "1", roles: ["admin"] }, "admin")).toBe(true);
  expect(hasRole(null, "admin")).toBe(false);
  expect(hasAnyRole({ id: "1", roles: ["a"] }, ["a", "b"])).toBe(true);
  expect(hasAllRoles({ id: "1", roles: ["a"] }, ["a", "b"])).toBe(false);
});

test("randomString/generateState use injected randomness deterministically", () => {
  const fixed = (n: number) => new Uint8Array(n).fill(0); // always index 0 → 'A'
  expect(randomString(5, { random: fixed })).toBe("AAAAA");
  expect(generateState({ random: fixed })).toBe("A".repeat(32));
  // custom alphabet
  expect(randomString(3, { random: (n) => new Uint8Array(n).fill(1), alphabet: "XY" })).toBe("YYY");
});

test("createPkcePair and codeChallengeS256 use an injected hasher (no WebCrypto)", async () => {
  const fakeSha = (_data: Uint8Array) => new Uint8Array([0, 0, 0]); // → base64url "AAAA"
  const challenge = await codeChallengeS256("verifier", { sha256: fakeSha });
  expect(challenge).toBe("AAAA");
  const pair = await createPkcePair({ verifier: "my-verifier", sha256: fakeSha });
  expect(pair.codeVerifier).toBe("my-verifier");
  expect(pair.codeChallenge).toBe("AAAA");
  expect(pair.codeChallengeMethod).toBe("S256");
});

test("buildAuthorizeUrl and parseAuthCallback round-trip an OAuth request", () => {
  const url = buildAuthorizeUrl({
    authorizationEndpoint: "https://id.example.com/authorize",
    clientId: "app123",
    redirectUri: "https://app.example.com/cb",
    scope: ["openid", "profile"],
    state: "st-1",
    codeChallenge: "chal",
  });
  expect(url).toContain("response_type=code");
  expect(url).toContain("client_id=app123");
  expect(url).toContain("scope=openid+profile");
  expect(url).toContain("code_challenge=chal");
  expect(url).toContain("code_challenge_method=S256");

  const cb = parseAuthCallback("https://app.example.com/cb?code=xyz&state=st-1");
  expect(cb.code).toBe("xyz");
  expect(cb.state).toBe("st-1");
  const err = parseAuthCallback("#error=access_denied&error_description=nope");
  expect(err.error).toBe("access_denied");
  expect(err.errorDescription).toBe("nope");
});

test("encode/decodeAuthMessage round-trips and rejects foreign messages", () => {
  const msg = { type: "login" as const, token: "t", at: 123 };
  const wire = encodeAuthMessage(msg);
  const decoded = decodeAuthMessage(wire);
  expect(decoded?.type).toBe("login");
  expect(decoded?.token).toBe("t");
  expect((decoded as { __tag?: unknown }).__tag).toBeUndefined();
  expect(decodeAuthMessage(JSON.stringify({ type: "login" }))).toBe(null); // no tag
  expect(decodeAuthMessage("{not json")).toBe(null);
});

test("instance authHeader/expiresAt/isAuthenticated reflect the current token", () => {
  const auth = new LacspaceAuth({ baseURL: "http://api.test" });
  expect(auth.authHeader()).toEqual({});
  expect(auth.isAuthenticated()).toBe(false);

  const token = makeJwt({ exp: 1000 }); // 1_000_000 ms
  auth.setToken(token);
  expect(auth.authHeader()).toEqual({ Authorization: `Bearer ${token}` });
  expect(auth.expiresAt()).toBe(1_000_000);
  expect(auth.isAuthenticated({ clock: () => 500_000 })).toBe(true);
  expect(auth.isAuthenticated({ clock: () => 2_000_000 })).toBe(false);
});

test("userHasRole/userHasScope read the signed-in user", async () => {
  const auth = new LacspaceAuth({
    baseURL: "http://api.test",
    fetch: fakeFetch({
      "auth/login": { token: "t", user: { id: "u1", roles: ["admin"], scope: "read write" } },
    }),
  });
  await auth.login({ username: "a", password: "b" });
  expect(auth.userHasRole("admin")).toBe(true);
  expect(auth.userHasRole("nope")).toBe(false);
  expect(auth.userHasScope("write")).toBe(true);
  expect(auth.userHasScope("delete")).toBe(false);
});

test("startAutoRefresh schedules a proactive refresh with injected timers", async () => {
  const auth = new LacspaceAuth({
    baseURL: "http://api.test",
    fetch: fakeFetch({
      "auth/refresh": { token: makeJwt({ exp: 5000 }), user: { id: "u1" } },
    }),
  });
  auth.setToken(makeJwt({ exp: 1000 })); // expires at 1_000_000 ms

  const timers: { fn: () => void; ms: number }[] = [];
  const refreshed: unknown[] = [];
  const stop = auth.startAutoRefresh({
    clock: () => 900_000,
    skewSec: 30,
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimer: () => {},
    onRefresh: (r) => refreshed.push(r),
  });

  expect(timers.length).toBe(1);
  expect(timers[0]!.ms).toBe(70_000); // 1_000_000 - 30_000 - 900_000

  await timers[0]!.fn(); // fire the scheduled refresh
  await new Promise((r) => setTimeout(r, 0));
  expect(refreshed.length).toBe(1);
  expect(auth.getToken()).toBe(makeJwt({ exp: 5000 }));
  stop();
});

test("startAutoRefresh is a no-op when the token has no exp", () => {
  const auth = new LacspaceAuth({ baseURL: "http://api.test" });
  auth.setToken(makeJwt({ sub: "x" }));
  const timers: number[] = [];
  const stop = auth.startAutoRefresh({ setTimer: () => timers.push(1) });
  expect(timers.length).toBe(0);
  stop();
});
