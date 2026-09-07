import { describe, it, expect, vi } from "vitest";
import { runHttpFile } from "./runner.js";

function findHeader(init: RequestInit | undefined, name: string): string | undefined {
  const h = init?.headers as Array<[string, string]> | undefined;
  return h?.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

describe("runHttpFile — capture chaining", () => {
  const file = [
    "# @name login",
    "POST https://api.test/login",
    "Content-Type: application/json",
    "",
    '{"user":"{{user}}"}',
    "# @capture token = body.$.token",
    "# @assert status == 200",
    "",
    "###",
    "# @name me",
    "GET https://api.test/me",
    "Authorization: Bearer {{token}}",
    "# @assert status == 200",
    '# @assert body.$.user == "ada"',
    "# @assert header.content-type contains json",
  ].join("\n");

  it("captures a token and reuses it in a later request", async () => {
    let meAuth: string | undefined;
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/login")) return json({ token: "T123" });
      if (u.includes("/me")) {
        meAuth = findHeader(init, "authorization");
        return json({ user: "ada" });
      }
      return new Response("not found", { status: 404 });
    });

    const result = await runHttpFile(file, { vars: { user: "ada" }, fetchImpl });
    expect(result.ok).toBe(true);
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.results[0]!.captured).toEqual({ token: "T123" });
    expect(meAuth).toBe("Bearer T123");
  });

  it("substitutes {{user}} from CLI vars into the request body", async () => {
    let loginBody: string | undefined;
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes("/login")) { loginBody = init?.body as string; return json({ token: "x" }); }
      return json({ user: "ada" });
    });
    await runHttpFile(file, { vars: { user: "ada" }, fetchImpl });
    expect(loginBody).toBe('{"user":"ada"}');
  });
});

describe("runHttpFile — assertions", () => {
  it("fails the run when an assertion fails", async () => {
    const file = [
      "GET https://api.test/thing",
      "# @assert status == 200",
      "# @assert body.$.ok == true",
    ].join("\n");
    const fetchImpl = vi.fn(async () => json({ ok: false }, 500));
    const result = await runHttpFile(file, { fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.failed).toBe(1);
    const asserts = result.results[0]!.assertions;
    expect(asserts[0]!.ok).toBe(false); // status
    expect(asserts[1]!.ok).toBe(false); // body.ok
  });

  it("passes a run where every assertion holds", async () => {
    const file = [
      "GET https://api.test/thing",
      "# @assert status == 200",
      "# @assert time < 100000",
    ].join("\n");
    const fetchImpl = vi.fn(async () => json({ ok: true }));
    const result = await runHttpFile(file, { fetchImpl });
    expect(result.ok).toBe(true);
    expect(result.results[0]!.assertions.every((a) => a.ok)).toBe(true);
  });
});

describe("runHttpFile — selection & errors", () => {
  const file = [
    "# @name a",
    "GET https://api.test/a",
    "###",
    "# @name b",
    "GET https://api.test/b",
  ].join("\n");

  it("runs only the named request with --name", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => json({ url: String(url) }));
    const result = await runHttpFile(file, { name: "b", fetchImpl });
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.name).toBe("b");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("records transport errors as a failed request", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("ECONNREFUSED"); });
    const result = await runHttpFile("GET https://api.test/down", { fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.results[0]!.error).toMatch(/ECONNREFUSED/);
  });

  it("reports unresolved variables and fails that request", async () => {
    const fetchImpl = vi.fn(async () => json({ ok: true }));
    const result = await runHttpFile("GET https://api.test/{{missing}}", { fetchImpl });
    expect(result.results[0]!.missingVars).toEqual(["missing"]);
    expect(result.results[0]!.ok).toBe(false);
  });
});
