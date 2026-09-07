import { describe, it, expect, vi } from "vitest";
import { createEngine, start } from "./server.js";
import type { MockConfig } from "./server.js";

function engine(over: Partial<MockConfig> = {}) {
  return createEngine({
    db: {
      users: [
        { id: 1, name: "Ava", role: "admin" },
        { id: 2, name: "Ben", role: "user" },
      ],
      posts: [{ id: 1, title: "Hello", userId: 1 }],
      profile: { theme: "dark" },
    },
    seed: "test",
    ...over,
  });
}

const jbody = (r: { body: string }): unknown => JSON.parse(r.body);

describe("server — CRUD", () => {
  it("GET /users lists with X-Total-Count", async () => {
    const res = await engine().handle({ method: "GET", url: "/users" });
    expect(res.status).toBe(200);
    expect(res.headers["x-total-count"]).toBe("2");
    expect(jbody(res)).toHaveLength(2);
  });

  it("GET /users?role=admin filters", async () => {
    const res = await engine().handle({ method: "GET", url: "/users?role=admin" });
    expect(jbody(res)).toEqual([{ id: 1, name: "Ava", role: "admin" }]);
  });

  it("GET /users/1 returns one, /users/99 is 404", async () => {
    const e = engine();
    expect((await e.handle({ method: "GET", url: "/users/1" })).status).toBe(200);
    const miss = await e.handle({ method: "GET", url: "/users/99" });
    expect(miss.status).toBe(404);
  });

  it("POST /users assigns id, 201 + Location", async () => {
    const res = await engine().handle({
      method: "POST", url: "/users", body: JSON.stringify({ name: "Cara" }),
    });
    expect(res.status).toBe(201);
    expect(res.headers["location"]).toBe("/users/3");
    expect((jbody(res) as { id: number }).id).toBe(3);
  });

  it("POST with a non-object body is 400", async () => {
    const res = await engine().handle({ method: "POST", url: "/users", body: "[1,2]" });
    expect(res.status).toBe(400);
  });

  it("PUT replaces, PATCH merges", async () => {
    const e = engine();
    const put = await e.handle({ method: "PUT", url: "/users/1", body: JSON.stringify({ nickname: "A" }) });
    expect(jbody(put)).toEqual({ id: 1, nickname: "A" });
    const patch = await e.handle({ method: "PATCH", url: "/users/2", body: JSON.stringify({ role: "admin" }) });
    expect(jbody(patch)).toEqual({ id: 2, name: "Ben", role: "admin" });
  });

  it("DELETE removes, second DELETE is 404", async () => {
    const e = engine();
    expect((await e.handle({ method: "DELETE", url: "/users/1" })).status).toBe(200);
    expect((await e.handle({ method: "DELETE", url: "/users/1" })).status).toBe(404);
  });

  it("unknown collection is 404", async () => {
    const res = await engine().handle({ method: "GET", url: "/widgets" });
    expect(res.status).toBe(404);
  });

  it("singular resource is read-only", async () => {
    const e = engine();
    expect(jbody(await e.handle({ method: "GET", url: "/profile" }))).toEqual({ theme: "dark" });
    expect((await e.handle({ method: "POST", url: "/profile", body: "{}" })).status).toBe(405);
  });

  it("mutations fire onChange (for --write)", async () => {
    const onChange = vi.fn();
    await engine({ onChange }).handle({ method: "POST", url: "/posts", body: JSON.stringify({ title: "x" }) });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("server — custom routes", () => {
  const routes = [
    { method: "GET", path: "/health", status: 200, body: { ok: true } },
    { method: "GET", path: "/users", status: 418, body: { teapot: true } }, // shadows CRUD
    {
      method: "POST", path: "/echo/:id",
      bodyTemplate: '{"id":"{{params.id}}","sent":{{body.n}},"uuid":"{{fake.uuid}}"}',
    },
  ];

  it("custom route takes precedence over CRUD", async () => {
    const res = await engine({ routes }).handle({ method: "GET", url: "/users" });
    expect(res.status).toBe(418);
    expect(jbody(res)).toEqual({ teapot: true });
  });

  it("static custom route responds", async () => {
    const res = await engine({ routes }).handle({ method: "GET", url: "/health" });
    expect(jbody(res)).toEqual({ ok: true });
  });

  it("templated route interpolates params, body and fake", async () => {
    const res = await engine({ routes }).handle({
      method: "POST", url: "/echo/42", body: JSON.stringify({ n: 7 }),
    });
    const parsed = jbody(res) as { id: string; sent: number; uuid: string };
    expect(parsed.id).toBe("42");
    expect(parsed.sent).toBe(7);
    expect(parsed.uuid).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("method mismatch falls through to CRUD/404", async () => {
    // /health is GET-only; POST should not match it → 404 (no such collection)
    const res = await engine({ routes }).handle({ method: "POST", url: "/health", body: "{}" });
    expect(res.status).toBe(404);
  });
});

describe("server — simulation & CORS", () => {
  it("injects a 500 when rng is below error-rate", async () => {
    const res = await engine({ errorRate: 1, rng: () => 0 }).handle({ method: "GET", url: "/users" });
    expect(res.status).toBe(500);
    expect((jbody(res) as { chaos: boolean }).chaos).toBe(true);
  });

  it("does not inject when rng is above error-rate", async () => {
    const res = await engine({ errorRate: 0.5, rng: () => 0.9 }).handle({ method: "GET", url: "/users" });
    expect(res.status).toBe(200);
  });

  it("calls the injected sleep with the delay", async () => {
    const sleep = vi.fn(async () => {});
    await engine({ delay: 250, sleep }).handle({ method: "GET", url: "/users" });
    expect(sleep).toHaveBeenCalledWith(250);
  });

  it("delay jitter stays within the range", async () => {
    const sleep = vi.fn((_ms: number) => Promise.resolve());
    await engine({ delay: [100, 200], rng: () => 0.5, sleep }).handle({ method: "GET", url: "/users" });
    const ms = sleep.mock.calls[0]![0];
    expect(ms).toBeGreaterThanOrEqual(100);
    expect(ms).toBeLessThanOrEqual(200);
  });

  it("adds CORS headers by default and answers preflight", async () => {
    const res = await engine().handle({ method: "OPTIONS", url: "/users" });
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it("omits CORS headers when disabled", async () => {
    const res = await engine({ cors: false }).handle({ method: "GET", url: "/users" });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("server — GraphQL", () => {
  it("resolves a query at POST /graphql", async () => {
    const res = await engine().handle({
      method: "POST", url: "/graphql", body: JSON.stringify({ query: "{ users { id name } }" }),
    });
    expect(res.status).toBe(200);
    expect((jbody(res) as { data: { users: unknown[] } }).data.users).toHaveLength(2);
  });

  it("400 on a missing query", async () => {
    const res = await engine().handle({ method: "POST", url: "/graphql", body: "{}" });
    expect(res.status).toBe(400);
  });
});

describe("server — integration (real port on 127.0.0.1)", () => {
  it("serves over http on an ephemeral port", async () => {
    const srv = await start({ db: { ping: [{ id: 1, v: "pong" }] }, port: 0, host: "127.0.0.1" });
    try {
      const res = await fetch(`${srv.url}/ping/1`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: 1, v: "pong" });
    } finally {
      await srv.close();
    }
  });
});
