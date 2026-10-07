import { describe, expect, it } from "vitest";
import { PIXEL_GIF, classifyClick, classifyOpen, createTracker, findTrackableLinks } from "./index";
import { fromBase64Url, toBase64Url } from "./bytes";

const SECRET = "test-secret-0123456789abcdef";
const ctx = { campaignId: "spring-sale", recipient: "Ram@Example.com", messageId: "<m1@mail.lacspace.com>" };
const BASE = "https://t.example.com";

function clock(start = Date.UTC(2026, 9, 7, 10, 0, 0)) {
  let t = start;
  return { now: () => t, set: (v: number) => (t = v), advance: (ms: number) => (t += ms) };
}

describe("createTracker", () => {
  it("throws on missing or short secret (programmer error)", () => {
    expect(() => createTracker("" as string)).toThrow(TypeError);
    expect(() => createTracker("short")).toThrow(TypeError);
    expect(() => createTracker(undefined as unknown as string)).toThrow(TypeError);
  });

  it("pixel token round-trips", async () => {
    const t = createTracker(SECRET);
    const tok = await t.pixelToken(ctx);
    expect(tok).toMatch(/^[A-Za-z0-9_-]+$/);
    const v = await t.verify(tok);
    expect(v?.kind).toBe("open");
    expect(v?.campaignId).toBe("spring-sale");
    expect(v?.messageId).toBe("<m1@mail.lacspace.com>");
    expect(v?.url).toBeUndefined();
  });

  it("click token round-trips with URL", async () => {
    const t = createTracker(SECRET);
    const tok = await t.clickToken({ ...ctx, url: "https://shop.example.com/p?a=1&b=2" });
    const v = await t.verify(tok);
    expect(v?.kind).toBe("click");
    expect(v?.url).toBe("https://shop.example.com/p?a=1&b=2");
  });

  it("does not store the recipient in clear", async () => {
    const t = createTracker(SECRET);
    const tok = await t.pixelToken(ctx);
    const raw = new TextDecoder().decode(fromBase64Url(tok)!);
    expect(raw.toLowerCase()).not.toContain("ram@example.com");
    const v = await t.verify(tok);
    expect(v?.recipient).not.toContain("@");
    expect(v?.recipient).toHaveLength(16);
  });

  it("recipientId matches token recipient, case/whitespace-insensitive", async () => {
    const t = createTracker(SECRET);
    const v = await t.verify(await t.pixelToken(ctx));
    expect(await t.recipientId("  ram@example.COM ")).toBe(v?.recipient);
    expect(await t.recipientId("sita@example.com")).not.toBe(v?.recipient);
  });

  it("recipient digest depends on the secret", async () => {
    const a = createTracker(SECRET);
    const b = createTracker(SECRET + "-other");
    expect(await a.recipientId("x@y.z")).not.toBe(await b.recipientId("x@y.z"));
  });

  it("rejects tokens signed with another secret", async () => {
    const a = createTracker(SECRET);
    const b = createTracker("another-secret-abcdefghijk");
    expect(await b.verify(await a.pixelToken(ctx))).toBeNull();
  });

  it("rejects tampered tokens (every byte flip)", async () => {
    const t = createTracker(SECRET);
    const tok = await t.clickToken({ ...ctx, url: "https://a.example/x" });
    const raw = fromBase64Url(tok)!;
    for (let i = 0; i < raw.length; i += 3) {
      const copy = raw.slice();
      copy[i] = (copy[i] as number) ^ 0x01;
      expect(await t.verify(toBase64Url(copy))).toBeNull();
    }
  });

  it("rejects a click token whose URL was swapped", async () => {
    const t = createTracker(SECRET);
    const tok = await t.clickToken({ ...ctx, url: "https://good.example/" });
    const raw = new TextDecoder("latin1").decode(fromBase64Url(tok)!);
    const swapped = raw.replace("good.example", "evil.example");
    const bytes = Uint8Array.from(swapped, (c) => c.charCodeAt(0));
    expect(await t.verify(toBase64Url(bytes))).toBeNull();
  });

  it("returns null for garbage without throwing", async () => {
    const t = createTracker(SECRET);
    for (const g of ["", "abc", "!!!!!!!!!!!!!!!!!", "a".repeat(5), "A".repeat(100), null, undefined, 42, "a".repeat(20000)]) {
      expect(await t.verify(g as unknown as string)).toBeNull();
    }
  });

  it("expires after ttlDays", async () => {
    const c = clock();
    const t = createTracker(SECRET, { ttlDays: 7, now: c.now });
    const tok = await t.pixelToken(ctx);
    c.advance(6 * 86400_000);
    expect(await t.verify(tok)).not.toBeNull();
    c.advance(2 * 86400_000);
    expect(await t.verify(tok)).toBeNull();
  });

  it("carries issuedAt and expiresAt", async () => {
    const c = clock();
    const t = createTracker(SECRET, { ttlDays: 30, now: c.now });
    const v = await t.verify(await t.pixelToken(ctx));
    expect(v?.issuedAt.toISOString()).toBe("2026-10-07T10:00:00.000Z");
    expect(v?.expiresAt.toISOString()).toBe("2026-11-06T10:00:00.000Z");
  });

  it("rejects tokens issued far in the future", async () => {
    const c = clock();
    const t = createTracker(SECRET, { now: c.now });
    const tok = await t.pixelToken(ctx);
    c.advance(-3600_000);
    expect(await t.verify(tok)).toBeNull();
  });

  it("default ttl is 180 days", async () => {
    const c = clock();
    const t = createTracker(SECRET, { now: c.now });
    const tok = await t.pixelToken(ctx);
    c.advance(179 * 86400_000);
    expect(await t.verify(tok)).not.toBeNull();
    c.advance(2 * 86400_000);
    expect(await t.verify(tok)).toBeNull();
  });

  it("handles unicode campaign ids and long URLs", async () => {
    const t = createTracker(SECRET);
    const url = "https://example.com/" + "a".repeat(3000) + "?q=नमस्ते";
    const v = await t.verify(await t.clickToken({ ...ctx, campaignId: "दशैं-२०८३", url }));
    expect(v?.campaignId).toBe("दशैं-२०८३");
    expect(v?.url).toBe(url);
  });

  it("tokens are compact", async () => {
    const t = createTracker(SECRET);
    const tok = await t.pixelToken({ campaignId: "c1", recipient: "a@b.co", messageId: "m1" });
    expect(tok.length).toBeLessThan(60);
  });
});

describe("resolveClick (no open redirect)", () => {
  it("returns the signed URL", async () => {
    const t = createTracker(SECRET);
    expect(await t.resolveClick(await t.clickToken({ ...ctx, url: "https://x.example/a" }))).toBe("https://x.example/a");
  });
  it("rejects pixel tokens", async () => {
    const t = createTracker(SECRET);
    expect(await t.resolveClick(await t.pixelToken(ctx))).toBeNull();
  });
  it("rejects signed non-http URLs", async () => {
    const t = createTracker(SECRET);
    expect(await t.resolveClick(await t.clickToken({ ...ctx, url: "javascript:alert(1)" }))).toBeNull();
  });
  it("rejects forged tokens", async () => {
    const t = createTracker(SECRET);
    expect(await t.resolveClick("aHR0cHM6Ly9ldmlsLmV4YW1wbGU")).toBeNull();
  });
});

describe("injectHtml", () => {
  const t = createTracker(SECRET);

  it("adds a 1x1 pixel before </body>", async () => {
    const out = await t.injectHtml("<html><body><p>Hi</p></body></html>", ctx, BASE);
    expect(out).toMatch(/<p>Hi<\/p><img src="https:\/\/t\.example\.com\/o\/[A-Za-z0-9_-]+" width="1" height="1" alt="" [^>]*\/><\/body><\/html>$/);
  });

  it("appends the pixel when there is no </body>", async () => {
    const out = await t.injectHtml("<p>Hi</p>", ctx, BASE);
    expect(out.startsWith("<p>Hi</p><img ")).toBe(true);
  });

  it("pixel token verifies as an open", async () => {
    const out = await t.injectHtml("<p>x</p>", ctx, BASE + "/");
    const tok = /\/o\/([A-Za-z0-9_-]+)/.exec(out)![1]!;
    expect((await t.verify(tok))?.kind).toBe("open");
    expect(out).not.toContain("com//o/");
  });

  it("rewrites http(s) links to signed click URLs", async () => {
    const html = '<a href="https://shop.example.com/sale">Shop</a> <a href=\'http://b.example/\'>B</a>';
    const out = await t.injectHtml(html, ctx, BASE, { pixel: false });
    const toks = [...out.matchAll(/\/c\/([A-Za-z0-9_-]+)/g)].map((m) => m[1]!);
    expect(toks).toHaveLength(2);
    expect((await t.verify(toks[0]!))?.url).toBe("https://shop.example.com/sale");
    expect((await t.verify(toks[1]!))?.url).toBe("http://b.example/");
    expect(out).toContain(">Shop</a>");
  });

  it("decodes &amp; in hrefs before signing", async () => {
    const out = await t.injectHtml('<a href="https://x.example/?a=1&amp;b=2">x</a>', ctx, BASE, { pixel: false });
    const tok = /\/c\/([A-Za-z0-9_-]+)/.exec(out)![1]!;
    expect((await t.verify(tok))?.url).toBe("https://x.example/?a=1&b=2");
  });

  it("handles unquoted hrefs", async () => {
    const out = await t.injectHtml("<a class=btn href=https://x.example/y>go</a>", ctx, BASE, { pixel: false });
    expect(out).toMatch(/^<a class=btn href=https:\/\/t\.example\.com\/c\/[A-Za-z0-9_-]+>go<\/a>$/);
  });

  const skipped: Array<[string, string]> = [
    ["mailto", '<a href="mailto:hi@example.com">Mail</a>'],
    ["tel", '<a href="tel:+9779800000000">Call</a>'],
    ["anchor", '<a href="#top">Top</a>'],
    ["relative", '<a href="/about">About</a>'],
    ["unsubscribe in href", '<a href="https://x.example/unsubscribe?u=1">Leave</a>'],
    ["unsubscribe in text", '<a href="https://x.example/u/abc">Unsubscribe</a>'],
    ["unsubscribe nested text", '<a href="https://x.example/u/abc"><span>Click to <b>unsubscribe</b></span></a>'],
    ["data-no-track", '<a data-no-track href="https://x.example/private">p</a>'],
    ["template var", '<a href="{{unsubscribe_url}}">x</a>'],
    ["template inside url", '<a href="https://x.example/?id={{id}}">x</a>'],
    ["javascript", '<a href="javascript:void(0)">x</a>'],
    ["inside comment", '<!-- <a href="https://x.example/">x</a> -->'],
    ["no href", "<a name=\"top\">x</a>"],
  ];
  for (const [name, html] of skipped) {
    it(`skips ${name} and leaves bytes identical`, async () => {
      expect(await t.injectHtml(html, ctx, BASE, { pixel: false })).toBe(html);
    });
  }

  it("skips List-Unsubscribe URLs passed in opts", async () => {
    const html = '<a href="https://lists.example.com/l/9f8e">Manage preferences</a>';
    expect(await t.injectHtml(html, ctx, BASE, { pixel: false, unsubscribeUrls: ["https://lists.example.com/l/9f8e"] })).toBe(html);
  });

  it("does not double-wrap already tracked links", async () => {
    const once = await t.injectHtml('<a href="https://x.example/">x</a>', ctx, BASE, { pixel: false });
    expect(await t.injectHtml(once, ctx, BASE, { pixel: false })).toBe(once);
  });

  it("leaves everything except rewritten hrefs byte-identical", async () => {
    const html =
      '<!doctype html>\n<html>\r\n<head><style>a{color:red}</style></head><body class="x">\n  <a   title="A &amp; B"  href="https://x.example/1" target=_blank>One</a>\n  <img src="https://cdn.example/p.png">\n</body></html>';
    const out = await t.injectHtml(html, ctx, BASE, { pixel: false });
    const restored = out.replace(/https:\/\/t\.example\.com\/c\/[A-Za-z0-9_-]+/, "https://x.example/1");
    expect(restored).toBe(html);
  });

  it("links:false only adds the pixel", async () => {
    const html = '<a href="https://x.example/">x</a>';
    const out = await t.injectHtml(html, ctx, BASE, { links: false });
    expect(out.startsWith(html)).toBe(true);
    expect(out).toContain("/o/");
  });

  it("returns empty string for non-string html", async () => {
    expect(await t.injectHtml(null as unknown as string, ctx, BASE)).toBe("");
  });

  it("findTrackableLinks reports offsets", () => {
    const html = '<p><a href="https://a.example/">a</a></p>';
    const [l] = findTrackableLinks(html, BASE);
    expect(html.slice(l!.start, l!.end)).toBe("https://a.example/");
  });
});

describe("PIXEL_GIF", () => {
  it("is a 43-byte GIF89a", () => {
    expect(PIXEL_GIF.length).toBe(43);
    expect(new TextDecoder().decode(PIXEL_GIF.subarray(0, 6))).toBe("GIF89a");
  });
});

const sent = new Date("2026-10-07T10:00:00Z");
const later = (s: number) => new Date(sent.getTime() + s * 1000);
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

describe("classifyOpen", () => {
  it("Apple MPP: bare Mozilla/5.0", () => {
    const r = classifyOpen({ userAgent: "Mozilla/5.0", at: later(30), sentAt: sent });
    expect(r.kind).toBe("apple-mpp");
  });
  it("Apple MPP: stronger with caller's Apple IP check", () => {
    const r = classifyOpen({ userAgent: "Mozilla/5.0", ip: "17.1.2.3", isAppleProxyIp: (ip) => ip.startsWith("17."), at: later(30), sentAt: sent });
    expect(r.kind).toBe("apple-mpp");
    expect(r.confidence).toBeGreaterThan(0.9);
  });
  it("Apple IP hook that throws is ignored", () => {
    const r = classifyOpen({ userAgent: CHROME, ip: "1.1.1.1", isAppleProxyIp: () => { throw new Error("x"); }, at: later(600), sentAt: sent });
    expect(r.kind).toBe("human");
  });
  it("Gmail image proxy is a proxy", () => {
    const r = classifyOpen({ userAgent: "Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)", at: later(3600), sentAt: sent });
    expect(r.kind).toBe("proxy");
    expect(r.reason).toMatch(/first/);
  });
  it("Yahoo proxy is a proxy", () => {
    expect(classifyOpen({ userAgent: "YahooMailProxy; https://help.yahoo.com/kb/yahoo-mail-proxy-SLN28749.html", at: later(60), sentAt: sent }).kind).toBe("proxy");
  });
  it("scanner UA is a bot", () => {
    expect(classifyOpen({ userAgent: "Mimecast-Scanner/1.0", at: later(600), sentAt: sent }).kind).toBe("bot");
    expect(classifyOpen({ userAgent: "python-requests/2.31", at: later(600), sentAt: sent }).kind).toBe("bot");
  });
  it("empty UA is a bot", () => {
    expect(classifyOpen({ userAgent: "", at: later(600), sentAt: sent }).kind).toBe("bot");
  });
  it("open within a second of sending is a bot", () => {
    expect(classifyOpen({ userAgent: CHROME, at: later(1), sentAt: sent }).kind).toBe("bot");
  });
  it("normal browser later is human", () => {
    const r = classifyOpen({ userAgent: CHROME, at: later(900), sentAt: sent });
    expect(r.kind).toBe("human");
    expect(r.confidence).toBeGreaterThan(0.5);
  });
  it("Outlook desktop is human", () => {
    expect(classifyOpen({ userAgent: "Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0.17928; Pro)", at: later(900), sentAt: sent }).kind).toBe("human");
  });
  it("never throws on junk", () => {
    expect(() => classifyOpen(undefined as never)).not.toThrow();
    expect(classifyOpen({ userAgent: CHROME, at: new Date("x"), sentAt: sent }).kind).toBe("human");
  });
});

describe("classifyClick", () => {
  it("HEAD request is a bot", () => {
    expect(classifyClick({ userAgent: CHROME, method: "HEAD", at: later(600), sentAt: sent }).kind).toBe("bot");
  });
  it("scanner UA is a bot", () => {
    expect(classifyClick({ userAgent: "Proofpoint URL Defense", at: later(600), sentAt: sent }).kind).toBe("bot");
  });
  it("click within seconds of sending is a bot", () => {
    expect(classifyClick({ userAgent: CHROME, at: later(2), sentAt: sent }).kind).toBe("bot");
  });
  it("burst over many links is a bot", () => {
    const r = classifyClick({
      userAgent: CHROME,
      at: later(120),
      sentAt: sent,
      url: "https://a/1",
      recentClicks: [
        { url: "https://a/2", at: later(120.5) },
        { url: "https://a/3", at: later(121) },
      ],
    });
    expect(r.kind).toBe("bot");
    expect(r.reason).toMatch(/3 different links/);
  });
  it("repeat clicks on the same link are not a burst", () => {
    const r = classifyClick({ userAgent: CHROME, at: later(120), sentAt: sent, url: "https://a/1", recentClicks: [{ url: "https://a/1", at: later(121) }] });
    expect(r.kind).toBe("human");
  });
  it("normal click is human", () => {
    expect(classifyClick({ userAgent: CHROME, at: later(3600), sentAt: sent }).kind).toBe("human");
  });
  it("never throws on junk", () => {
    expect(() => classifyClick({} as never)).not.toThrow();
  });
});
