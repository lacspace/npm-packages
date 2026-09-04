import { test, expect } from "vitest";
import { LacspaceAuth, memoryTokenStorage } from "./index";

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
