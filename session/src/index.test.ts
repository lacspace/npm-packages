import { describe, expect, it } from "vitest";
import { clearCookie, createCookieSession, createCsrf, createOAuthStateStore, getCookie, parseCookies, serializeCookie, setFlash, takeFlash } from "./index.js";

const SECRET = "a-very-long-session-secret-of-at-least-32-chars";
const SECRET2 = "another-very-long-session-secret-for-rotation-ok";

function clock(start = 1_700_000_000_000) {
  let t = start;
  return { now: () => t, tick: (s: number) => (t += s * 1000) };
}

describe("cookies", () => {
  it("parses a Cookie header, first value wins, quoted + encoded values", () => {
    expect(parseCookies("a=1; b=%20x; a=2; c=\"q\"; bad")).toEqual({ a: "1", b: " x", c: "q" });
    expect(parseCookies(null)).toEqual({});
  });
  it("serializes with secure defaults", () => {
    expect(serializeCookie("sid", "v", { maxAge: 60 })).toBe("sid=v; Max-Age=60; Path=/; Secure; HttpOnly; SameSite=Lax");
    expect(serializeCookie("sid", "v", { secure: false, httpOnly: false, sameSite: "strict", domain: "example.com", path: "/app", priority: "high" })).toBe(
      "sid=v; Domain=example.com; Path=/app; SameSite=Strict; Priority=High",
    );
  });
  it("enforces __Host- and __Secure- rules and SameSite=None", () => {
    expect(() => serializeCookie("__Host-a", "v", { secure: false })).toThrow(/Secure/);
    expect(() => serializeCookie("__Host-a", "v", { path: "/x" })).toThrow(/Path/);
    expect(() => serializeCookie("__Host-a", "v", { domain: "x.com" })).toThrow(/Domain/);
    expect(() => serializeCookie("__Secure-a", "v", { secure: false })).toThrow(/Secure/);
    expect(() => serializeCookie("a", "v", { sameSite: "none", secure: false })).toThrow(/SameSite=None/);
  });
  it("rejects attribute smuggling in names and values", () => {
    expect(() => serializeCookie("a;b", "v")).toThrow(/name/);
    expect(() => serializeCookie("a", "v; Path=/evil")).toThrow(/value/);
    expect(() => serializeCookie("a", "v", { path: "/;x" })).toThrow(/path/);
  });
  it("clears", () => {
    expect(clearCookie("sid")).toBe("sid=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; Secure; HttpOnly; SameSite=Lax");
  });
  it("reads from Web Request, Node request and pre-parsed cookies", () => {
    expect(getCookie(new Request("https://x/", { headers: { cookie: "a=1; b=2" } }), "b")).toBe("2");
    expect(getCookie({ headers: { cookie: "a=1" } }, "a")).toBe("1");
    expect(getCookie({ headers: { cookie: ["a=1", "b=2"] } }, "b")).toBe("2");
    expect(getCookie({ cookies: { a: "z" } }, "a")).toBe("z");
    expect(getCookie(undefined, "a")).toBeUndefined();
  });
});

describe("encrypted session", () => {
  it("round-trips data through a Set-Cookie header", async () => {
    const s = createCookieSession<{ userId: string; roles: string[] }>({ secrets: SECRET });
    const header = await s.commit({ userId: "u1", roles: ["admin"] });
    expect(header.startsWith("__Host-session=v1.")).toBe(true);
    expect(header).toMatch(/; Max-Age=604800; Path=\/; Secure; HttpOnly; SameSite=Lax$/);
    const cookie = header.split(";")[0]!;
    const r = await s.read(cookie);
    expect(r.data).toEqual({ userId: "u1", roles: ["admin"] });
    expect(r.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(r.expiresAt! - r.createdAt!).toBe(604800);
    expect(cookie).not.toContain("u1");
  });
  it("reports missing / malformed / version / unknown_key / tampered / expired", async () => {
    const c = clock();
    const s = createCookieSession({ secrets: SECRET, now: c.now, maxAge: 100 });
    const tok = (await s.commit({ a: 1 })).split(";")[0]!.split("=")[1]!;
    expect((await s.read("")).reason).toBe("missing");
    expect((await s.read("__Host-session=garbage")).reason).toBe("malformed");
    expect((await s.read(`__Host-session=${tok.replace(/^v1/, "v9")}`)).reason).toBe("version");
    const [v, , m, body] = tok.split(".");
    expect((await s.read(`__Host-session=${v}.zzzzzzzz.${m}.${body}`)).reason).toBe("unknown_key");
    const flipped = body!.slice(0, -2) + (body!.endsWith("A") ? "BB" : "AA");
    expect((await s.read(`__Host-session=${tok.replace(body!, flipped)}`)).reason).toBe("tampered");
    // AAD binds the header: swapping the mode letter fails too
    expect((await s.read(`__Host-session=${tok.replace(".e.", ".s.")}`)).reason).toBe("malformed");
    c.tick(101);
    expect((await s.read(`__Host-session=${tok}`)).reason).toBe("expired");
  });
  it("honours clockTolerance and absoluteMaxAge", async () => {
    const c = clock();
    const s = createCookieSession({ secrets: SECRET, now: c.now, maxAge: 100, clockTolerance: 5, absoluteMaxAge: 150 });
    const tok = (await s.commit({ a: 1 })).split(";")[0]!;
    c.tick(103);
    expect((await s.read(tok)).data).toEqual({ a: 1 });
    c.tick(3);
    expect((await s.read(tok)).reason).toBe("expired");
    // re-commit keeping createdAt: capped by absolute
    const first = await s.read((await s.commit({ a: 1 })).split(";")[0]!);
    const again = await s.commit({ a: 2 }, { id: first.id, createdAt: first.createdAt, maxAge: 200 });
    expect(again).toContain("; Max-Age=150;");
    const r2 = await s.read(again.split(";")[0]!);
    expect(r2.expiresAt).toBe(first.createdAt! + 150);
    expect(r2.id).toBe(first.id);
  });
  it("rotates secrets: new secret writes, old one still reads, unknown fails", async () => {
    const old = createCookieSession({ secrets: SECRET });
    const tok = (await old.commit({ who: "old" })).split(";")[0]!;
    const rotated = createCookieSession({ secrets: [SECRET2, SECRET] });
    expect((await rotated.read(tok)).data).toEqual({ who: "old" });
    const tok2 = (await rotated.commit({ who: "new" })).split(";")[0]!;
    expect((await old.read(tok2)).reason).toBe("unknown_key");
    const dropped = createCookieSession({ secrets: SECRET2 });
    expect((await dropped.read(tok)).reason).toBe("unknown_key");
    expect((await dropped.read(tok2)).data).toEqual({ who: "new" });
  });
  it("rolling: re-issues once past half-life, not before, never past absolute", async () => {
    const c = clock();
    const s = createCookieSession({ secrets: SECRET, now: c.now, maxAge: 100, rolling: true, absoluteMaxAge: 130 });
    const tok = (await s.commit({ a: 1 })).split(";")[0]!;
    c.tick(40);
    expect((await s.read(tok)).refreshedCookie).toBeUndefined();
    c.tick(20);
    const r = await s.read(tok);
    expect(r.refreshedCookie).toMatch(/^__Host-session=v1\./);
    const r2 = await s.read(r.refreshedCookie!.split(";")[0]!);
    expect(r2.expiresAt).toBe(r.createdAt! + 130); // capped
    expect(r2.id).toBe(r.id);
    c.tick(75); // t=135 > absolute
    expect((await s.read(r.refreshedCookie!.split(";")[0]!)).reason).toBe("expired");
  });
  it("refuses secrets that are too short and cookies that are too big", async () => {
    expect(() => createCookieSession({ secrets: "short" })).toThrow(/32/);
    const s = createCookieSession({ secrets: SECRET });
    await expect(s.commit({ blob: "x".repeat(5000) })).rejects.toThrow(/4096/);
  });
  it("seal/unseal raw tokens and custom cookie attributes", async () => {
    const s = createCookieSession({ secrets: SECRET, cookie: { name: "sid", sameSite: "strict", domain: "example.com", secure: true } });
    const h = await s.commit({ a: 1 });
    expect(h).toMatch(/^sid=.*; Domain=example.com; Path=\/; Secure; HttpOnly; SameSite=Strict$/);
    const raw = await s.seal({ a: 2 });
    expect((await s.unseal(raw)).data).toEqual({ a: 2 });
    expect(s.destroy()).toMatch(/^sid=; Max-Age=0/);
  });
  it("reads from a Web Request", async () => {
    const s = createCookieSession({ secrets: SECRET });
    const h = await s.commit({ a: 1 });
    const req = new Request("https://x/", { headers: { cookie: `other=1; ${h.split(";")[0]}` } });
    expect((await s.read(req)).data).toEqual({ a: 1 });
  });
});

describe("signed session", () => {
  it("is readable but tamper-proof", async () => {
    const s = createCookieSession<{ theme: string }>({ secrets: SECRET, mode: "signed", cookie: { name: "prefs", httpOnly: false } });
    const tok = (await s.commit({ theme: "dark" })).split(";")[0]!.split("=")[1]!;
    const [, , m, body] = tok.split(".");
    expect(m).toBe("s");
    expect(JSON.parse(Buffer.from(body!, "base64url").toString()).d).toEqual({ theme: "dark" });
    expect((await s.read(`prefs=${tok}`)).data).toEqual({ theme: "dark" });
    const forged = Buffer.from(JSON.stringify({ d: { theme: "admin" }, i: "x", c: 1, e: 9e9 })).toString("base64url");
    expect((await s.read(`prefs=${tok.replace(body!, forged)}`)).reason).toBe("tampered");
    const enc = createCookieSession({ secrets: SECRET, cookie: { name: "prefs" } });
    expect((await enc.read(`prefs=${tok}`)).reason).toBe("malformed");
  });
});

describe("oauth state store", () => {
  it("stores state/verifier/nonce for 10 minutes", async () => {
    const c = clock();
    const st = createOAuthStateStore({ secrets: SECRET, now: c.now });
    const h = await st.create({ state: "s1", codeVerifier: "v", nonce: "n", returnTo: "/app" });
    expect(h).toMatch(/^__Host-oauth=v1\..*; Max-Age=600;/);
    expect(await st.read(h.split(";")[0]!)).toEqual({ state: "s1", codeVerifier: "v", nonce: "n", returnTo: "/app" });
    c.tick(601);
    expect(await st.read(h.split(";")[0]!)).toBeNull();
    expect(st.clear()).toMatch(/^__Host-oauth=; Max-Age=0/);
  });
});

describe("csrf", () => {
  it("issues tokens bound to a session id and verifies them", async () => {
    const c = clock();
    const csrf = createCsrf({ secrets: SECRET, now: c.now, maxAge: 60 });
    const t = await csrf.issue("sess-A");
    expect(await csrf.verify(t, "sess-A")).toBe(true);
    expect(await csrf.verify(t, "sess-B")).toBe(false);
    expect(await csrf.verify(t + "x", "sess-A")).toBe(false);
    expect(await csrf.verify(null, "sess-A")).toBe(false);
    expect(await csrf.verify(t, null)).toBe(false);
    c.tick(61);
    expect(await csrf.verify(t, "sess-A")).toBe(false);
  });
  it("rotates secrets and extracts tokens from headers/bodies", async () => {
    const a = createCsrf({ secrets: SECRET });
    const t = await a.issue("s");
    const b = createCsrf({ secrets: [SECRET2, SECRET] });
    expect(await b.verify(t, "s")).toBe(true);
    expect(await createCsrf({ secrets: SECRET2 }).verify(t, "s")).toBe(false);
    expect(a.tokenFrom(new Request("https://x/", { headers: { "x-csrf-token": "hdr" } }))).toBe("hdr");
    expect(a.tokenFrom({ headers: {} }, { _csrf: "body" })).toBe("body");
    const fd = new FormData();
    fd.set("_csrf", "form");
    expect(a.tokenFrom({ headers: {} }, fd)).toBe("form");
    expect(a.tokenFrom({ headers: {} })).toBeNull();
  });
});

describe("flash", () => {
  it("sets and takes one-shot values", () => {
    const d = setFlash({ userId: "u" }, "msg", "Saved!");
    const { value, data } = takeFlash(d, "msg");
    expect(value).toBe("Saved!");
    expect(data).toEqual({ userId: "u" });
    expect(takeFlash(data, "msg").value).toBeUndefined();
  });
});
