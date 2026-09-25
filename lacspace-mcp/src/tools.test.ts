import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "./lib";
import { startFixture } from "./fixture";
import { getBrowser, closeBrowser } from "./tools/browser";

let base = "";
let close: () => Promise<void>;
let sandbox = "";
let outside = "";

beforeAll(async () => {
  ({ base, close } = await startFixture());
  sandbox = await mkdtemp(join(tmpdir(), "mcp-sandbox-"));
  outside = await mkdtemp(join(tmpdir(), "mcp-outside-"));
  await writeFile(join(sandbox, "notes.md"), "# Notes\n\nHello **world**.\n");
  await writeFile(join(sandbox, "table.csv"), "a,b\n1,2\n3,4\n");
  await writeFile(join(outside, "secret.txt"), "top secret");
  await symlink(join(outside, "secret.txt"), join(sandbox, "link-out.txt"));
});
afterAll(async () => { await closeBrowser(); await close(); await rm(sandbox, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); });
const hasBrowser = await getBrowser().then(() => true, () => false);

const server = () => createServer({ policy: { allowedPaths: [sandbox], timeoutMs: 5000 } });

describe("fetch_page", () => {
  test("returns metadata, headings and text; optional sections on request", async () => {
    const out = await server().invoke("fetch_page", { url: base + "/", include: ["headings", "links", "tables", "openGraph", "jsonLd"] });
    expect(out.isError).toBeUndefined();
    expect(out.data).toMatchObject({ status: 200, title: "Acme Widgets", description: "Widgets for everyone", canonical: "https://acme.example/", lang: "en" });
    expect(out.text).toContain("# Welcome to Acme");
    expect(out.text).toContain("We make widgets");
    expect((out.data!.links as { href: string }[]).some((l) => l.href === base + "/about")).toBe(true);
    expect((out.data!.jsonLd as unknown[])[0]).toMatchObject({ "@type": "Organization" });
    expect((out.data!.tables as unknown[]).length).toBe(1);
    expect(out.data!.openGraph).toMatchObject({ title: "Acme" });
  });
  test("non-HTML bodies are returned as text; 404 is an error result", async () => {
    const json = await server().invoke("fetch_page", { url: base + "/data.json" });
    expect(json.text).toContain('"ok":true');
    const missing = await server().invoke("fetch_page", { url: base + "/missing" });
    expect(missing).toMatchObject({ isError: true, data: { status: 404 } });
  });
  test("maxChars truncates and says so", async () => {
    const out = await server().invoke("fetch_page", { url: base + "/", maxChars: 500 });
    expect(out.data!.truncated).toBe(true);
    expect(out.text).toContain("[truncated");
  });
});

describe("scrape", () => {
  test("repeats a schema over items with attribute and pipe syntax", async () => {
    const out = await server().invoke("scrape", { url: base + "/", item: ".product", schema: { name: "h3", price: ".price | number", link: "a@href" } });
    expect(out.data!.count).toBe(2);
    expect(out.data!.records).toMatchObject([
      { name: "Alpha", price: 10, link: base + "/alpha" },
      { name: "Beta", price: 25.5, link: base + "/beta" },
    ]);
  });
});

describe("crawl_site", () => {
  test("follows same-origin links within depth and limit", async () => {
    const out = await server().invoke("crawl_site", { url: base + "/", depth: 1, limit: 10 });
    const urls = (out.data!.results as { url: string }[]).map((r) => r.url).sort();
    expect(urls).toEqual([base + "/", base + "/about", base + "/alpha", base + "/beta"]);
    expect(urls.some((u) => u.includes("elsewhere"))).toBe(false);
    expect(out.text).toContain("## About Acme");
  });
});

describe("extract_document", () => {
  test("reads a local file inside the sandbox as markdown", async () => {
    const out = await server().invoke("extract_document", { source: join(sandbox, "notes.md") });
    expect(out.isError).toBeUndefined();
    expect(out.text).toContain("Hello");
  });
  test("refuses files outside the sandbox, including via symlink", async () => {
    await expect(server().invoke("extract_document", { source: join(outside, "secret.txt") })).rejects.toThrow(/outside the allowed directories/);
    await expect(server().invoke("extract_document", { source: join(sandbox, "link-out.txt") })).rejects.toThrow(/outside the allowed directories/);
    await expect(server().invoke("extract_document", { source: join(sandbox, "..", "..", "etc", "passwd") })).rejects.toThrow(/not found|outside/);
  });
  test("a folder reported by the client as a workspace root is readable too", async () => {
    const s = createServer({ policy: { allowedPaths: [sandbox] } });
    s.policy.rootPaths = [outside];
    const out = await s.invoke("extract_document", { source: join(outside, "secret.txt") });
    expect(out.text).toContain("top secret");
  });
  test("downloads a URL to a temp file and cleans up", async () => {
    const out = await server().invoke("extract_document", { source: base + "/doc.csv" });
    expect(out.isError).toBeUndefined();
    expect(out.text).toMatch(/bolt/);
    expect(out.data!.kind).toBeDefined();
  });
});

describe("audit_page", () => {
  test("grades the fixture and lists fixes", async () => {
    const out = await server().invoke("audit_page", { url: base + "/" });
    expect(out.data).toMatchObject({ url: base + "/", https: false });
    expect(typeof out.data!.score).toBe("number");
    expect(out.text).toMatch(/Grade|Score/i);
  });
});

describe("check_site", () => {
  test("reports status, redirect chain and timing; http has no TLS block", async () => {
    const out = await server().invoke("check_site", { url: base + "/redirect" });
    expect(out.data).toMatchObject({ up: true, status: 200, finalUrl: base + "/about" });
    expect((out.data!.hops as unknown[]).length).toBe(2);
    expect(out.data!.tls).toBeUndefined();
    expect(out.text).toContain("Server: fixture");
    const down = await server().invoke("check_site", { url: base + "/missing" });
    expect(down).toMatchObject({ isError: true, data: { up: false, status: 404 } });
  });
});

describe("validate_email", () => {
  test("syntax, disposable, role and suggestion without touching DNS", async () => {
    const out = await server().invoke("validate_email", { email: "Info@Mailinator.com", checkMx: false });
    expect(out.data).toMatchObject({ valid: true, disposable: true, role: true, normalized: "info@mailinator.com" });
    const typo = await server().invoke("validate_email", { email: "jo@gmial.com", checkMx: false });
    expect(typo.data!.suggestion).toBe("jo@gmail.com");
    const bad = await server().invoke("validate_email", { email: "not an email", checkMx: false });
    expect(bad.data!.valid).toBe(false);
  });
});

describe("find_leads", () => {
  test("uses the injected implementation and formats leads", async () => {
    const s = createServer({ deps: { leads: { load: async () => ({ scrapeLeads: async () => [{ name: "Dr Smile", rating: 4.8, reviews: 120, phone: "+49 30 1", website: "https://smile.example", address: "Berlin" }] }) } } });
    const out = await s.invoke("find_leads", { type: "dentist", city: "Berlin" });
    expect(out.data).toMatchObject({ count: 1 });
    expect(out.text).toContain("Dr Smile | 4.8★ (120) | +49 30 1 | https://smile.example | Berlin");
  });
  test("a missing browser becomes a readable error result, not a crash", async () => {
    const s = createServer({ deps: { leads: { load: async () => ({ scrapeLeads: async () => { throw new Error("browserType.launch: Executable doesn't exist at /x/chromium"); } }) } } });
    const out = await s.invoke("find_leads", { type: "dentist" });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("npx playwright install chromium");
  });
});

describe("policy", () => {
  test("--block-private refuses loopback and metadata targets", async () => {
    const s = createServer({ policy: { blockPrivate: true } });
    await expect(s.invoke("fetch_page", { url: base + "/" })).rejects.toThrow(/private-network/);
    await expect(s.invoke("check_site", { url: "http://169.254.169.254/latest/meta-data/" })).rejects.toThrow(/metadata/);
    await expect(s.invoke("fetch_page", { url: "ftp://example.com/x" })).rejects.toThrow(/only http/);
  });
  test("only / disable restrict the tool list", () => {
    expect([...createServer({ only: ["fetch_page", "check_site"] }).tools.keys()]).toEqual(["fetch_page", "check_site"]);
    expect(createServer({ disable: ["find_leads"] }).tools.has("find_leads")).toBe(false);
    expect(() => createServer({ only: ["nope"] })).toThrow(/unknown tool/);
  });
});

describe("browser tools", () => {
  test.skipIf(!hasBrowser)("screenshot_page returns a PNG the model can see", async () => {
    const out = await server().invoke("screenshot_page", { url: base + "/" });
    expect(out.isError).toBeUndefined();
    expect(out.images).toHaveLength(1);
    expect(out.images![0]!.mimeType).toBe("image/png");
    const png = Buffer.from(out.images![0]!.data, "base64");
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(out.data).toMatchObject({ status: 200, title: "Acme Widgets" });
  });
  test.skipIf(!hasBrowser)("fetch_page render=true reads the rendered DOM", async () => {
    const out = await server().invoke("fetch_page", { url: base + "/", render: true });
    expect(out.data).toMatchObject({ title: "Acme Widgets", status: 200 });
    expect(out.text).toContain("We make widgets");
  });
  test.skipIf(hasBrowser)("without a browser, screenshot_page explains how to install one", async () => {
    const out = await server().invoke("screenshot_page", { url: base + "/" });
    expect(out).toMatchObject({ isError: true });
    expect(out.text).toContain("playwright install chromium");
  });
});
