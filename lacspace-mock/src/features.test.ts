import { describe, it, expect, vi } from "vitest";
import { createEngine } from "./server.js";
import type { MockConfig, RouteConfig } from "./server.js";
import type { FetchLike } from "./proxy.js";

const jbody = (r: { body: string }): unknown => JSON.parse(r.body);

function engine(over: Partial<MockConfig> = {}) {
  return createEngine({
    db: { users: [{ id: 1, name: "Ava", role: "admin" }] },
    seed: "test",
    ...over,
  });
}

describe("stateful CRUD persistence (session)", () => {
  it("create → read → update → delete all reflect through subsequent GETs", async () => {
    const e = engine();

    // create
    const created = await e.handle({ method: "POST", url: "/users", body: JSON.stringify({ name: "Ben" }) });
    expect(created.status).toBe(201);
    const id = (jbody(created) as { id: number }).id;
    expect(id).toBe(2);

    // read reflects the create
    let list = await e.handle({ method: "GET", url: "/users" });
    expect(jbody(list)).toHaveLength(2);

    // update
    await e.handle({ method: "PATCH", url: `/users/${id}`, body: JSON.stringify({ role: "editor" }) });
    const read = await e.handle({ method: "GET", url: `/users/${id}` });
    expect((jbody(read) as { role: string }).role).toBe("editor");

    // delete
    const del = await e.handle({ method: "DELETE", url: `/users/${id}` });
    expect(del.status).toBe(200);
    list = await e.handle({ method: "GET", url: "/users" });
    expect(jbody(list)).toHaveLength(1);
  });

  it("reset() restores the original db, discarding mutations", async () => {
    const e = engine();
    await e.handle({ method: "POST", url: "/users", body: JSON.stringify({ name: "Ben" }) });
    await e.handle({ method: "DELETE", url: "/users/1" });
    expect(jbody(await e.handle({ method: "GET", url: "/users" }))).toHaveLength(1);

    e.reset();
    const after = await e.handle({ method: "GET", url: "/users" });
    expect(jbody(after)).toEqual([{ id: 1, name: "Ava", role: "admin" }]);
  });
});

describe("chaos with configurable statuses", () => {
  it("injects a chosen status from the pool", async () => {
    const res = await engine({ errorRate: 1, errorStatuses: [503], rng: () => 0 }).handle({ method: "GET", url: "/users" });
    expect(res.status).toBe(503);
    expect((jbody(res) as { chaos: boolean }).chaos).toBe(true);
  });

  it("still defaults to 500 when no pool is given", async () => {
    const res = await engine({ errorRate: 1, rng: () => 0 }).handle({ method: "GET", url: "/users" });
    expect(res.status).toBe(500);
  });
});

describe("request validation", () => {
  it("rejects an invalid custom-route body with 400 + details", async () => {
    const routes: RouteConfig[] = [{
      method: "POST", path: "/signup",
      validate: { body: { type: "object", required: ["email"], properties: { email: { type: "string" } } } },
      body: { ok: true },
    }];
    const bad = await engine({ routes }).handle({ method: "POST", url: "/signup", body: JSON.stringify({}) });
    expect(bad.status).toBe(400);
    expect((jbody(bad) as { details: unknown[] }).details.length).toBeGreaterThan(0);

    const good = await engine({ routes }).handle({ method: "POST", url: "/signup", body: JSON.stringify({ email: "a@b.co" }) });
    expect(good.status).toBe(200);
    expect(jbody(good)).toEqual({ ok: true });
  });

  it("validates CRUD writes against a per-collection schema", async () => {
    const schemas = { users: { type: "object" as const, required: ["name"], properties: { name: { type: "string" as const } } } };
    const bad = await engine({ schemas }).handle({ method: "POST", url: "/users", body: JSON.stringify({ role: "x" }) });
    expect(bad.status).toBe(400);

    const good = await engine({ schemas }).handle({ method: "POST", url: "/users", body: JSON.stringify({ name: "Cara" }) });
    expect(good.status).toBe(201);
  });
});

describe("record & replay proxy fallback", () => {
  const fetch = vi.fn(async () => ({ status: 200, headers: { "content-type": "application/json" }, body: '{"from":"upstream"}' })) as unknown as FetchLike;

  it("forwards an otherwise-404 route to the proxy and records it", async () => {
    const e = engine({ proxy: { target: "https://up", mode: "auto", fetch } });
    const res = await e.handle({ method: "GET", url: "/external/thing" });
    expect(res.status).toBe(200);
    expect(jbody(res)).toEqual({ from: "upstream" });
    expect(e.proxy?.cassette["GET /external/thing"]).toBeDefined();
  });

  it("does not proxy routes the local db already serves", async () => {
    const local = vi.fn(async () => ({ status: 200, headers: {}, body: "{}" })) as unknown as FetchLike;
    const e = engine({ proxy: { target: "https://up", mode: "auto", fetch: local } });
    const res = await e.handle({ method: "GET", url: "/users/1" });
    expect((jbody(res) as { name: string }).name).toBe("Ava");
    expect(local).not.toHaveBeenCalled();
  });
});
