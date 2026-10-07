import { describe, expect, it } from "vitest";
import { countSpfLookups, evaluateSpf, findSpfRecords, parseSpf } from "./spf.js";
import { cidrMatch, parseIp6 } from "./ip.js";
import { fakeResolver } from "./fake-dns.testutil.js";

const codes = (ps: { code: string }[]) => ps.map((x) => x.code);

describe("parseSpf", () => {
  it("parses a typical record", () => {
    const s = parseSpf("v=spf1 ip4:203.0.113.0/24 ip6:2001:db8::/32 include:_spf.google.com mx -all");
    expect(s.valid).toBe(true);
    expect(s.all).toBe("-");
    expect(s.includes).toEqual(["_spf.google.com"]);
    expect(s.ip4).toEqual(["203.0.113.0/24"]);
    expect(s.ip6).toEqual(["2001:db8::/32"]);
    expect(s.lookupTerms).toBe(2);
    expect(s.problems).toEqual([]);
  });

  it("is case-insensitive and tolerates extra whitespace", () => {
    const s = parseSpf("  V=SPF1   INCLUDE:Example.com    ~ALL ");
    expect(s.valid).toBe(true);
    expect(s.all).toBe("~");
    expect(s.includes).toEqual(["Example.com"]);
  });

  it("rejects records that don't start with v=spf1", () => {
    expect(parseSpf("v=spf2 -all").valid).toBe(false);
    expect(codes(parseSpf("spf1 include:x.com -all").problems)).toContain("spf-not-spf");
  });

  it("flags unknown mechanisms and bad IPs as syntax errors", () => {
    expect(codes(parseSpf("v=spf1 includes:x.com -all").problems)).toContain("spf-syntax");
    expect(parseSpf("v=spf1 ip4:300.1.1.1 -all").valid).toBe(false);
    expect(parseSpf("v=spf1 ip4:10.0.0.0/33 -all").valid).toBe(false);
    expect(parseSpf("v=spf1 ip6:2001:db8::zz -all").valid).toBe(false);
    expect(parseSpf("v=spf1 include: -all").valid).toBe(false);
    expect(parseSpf("v=spf1 -all:foo").valid).toBe(false);
  });

  it("parses a/mx with domain and dual CIDR", () => {
    const s = parseSpf("v=spf1 a:mail.example.com/24//64 mx/28 -all");
    expect(s.valid).toBe(true);
    expect(s.terms[0]).toMatchObject({ name: "a", value: "mail.example.com", cidr4: 24, cidr6: 64 });
    expect(s.terms[1]).toMatchObject({ name: "mx", cidr4: 28 });
  });

  it("accepts macros syntactically and marks them", () => {
    const s = parseSpf("v=spf1 exists:%{i}._spf.example.com -all");
    expect(s.valid).toBe(true);
    expect(s.terms[0]!.macro).toBe(true);
  });

  it("warns about +all, ?all, ptr, missing all and terms after all", () => {
    expect(codes(parseSpf("v=spf1 +all").problems)).toContain("spf-all-pass");
    expect(codes(parseSpf("v=spf1 ?all").problems)).toContain("spf-all-neutral");
    expect(codes(parseSpf("v=spf1 ptr -all").problems)).toContain("spf-ptr");
    expect(codes(parseSpf("v=spf1 include:x.com").problems)).toContain("spf-no-all");
    expect(codes(parseSpf("v=spf1 -all include:x.com").problems)).toContain("spf-after-all");
  });

  it("handles redirect= and duplicate modifiers", () => {
    const s = parseSpf("v=spf1 redirect=_spf.google.com");
    expect(s.redirect).toBe("_spf.google.com");
    expect(s.lookupTerms).toBe(1);
    expect(codes(s.problems)).not.toContain("spf-no-all");
    expect(parseSpf("v=spf1 redirect=a.com redirect=b.com").valid).toBe(false);
  });

  it("findSpfRecords only picks real SPF strings", () => {
    expect(findSpfRecords(["google-site-verification=x", "v=spf1 -all", "v=spf10 x", "v=spf1"])).toEqual(["v=spf1 -all", "v=spf1"]);
  });
});

describe("SPF lookup counting", () => {
  it("counts nested includes recursively", async () => {
    const resolver = fakeResolver({
      "TXT example.com": ["v=spf1 include:a.test include:b.test mx ~all"],
      "TXT a.test": ["v=spf1 include:c.test ip4:1.2.3.4 -all"],
      "TXT b.test": ["v=spf1 a -all"],
      "TXT c.test": ["v=spf1 ip4:5.6.7.8 -all"],
      "MX example.com": [{ exchange: "mx.example.com", priority: 10 }],
      "A b.test": ["9.9.9.9"],
    });
    const r = await countSpfLookups("example.com", { resolver });
    // include:a + include:b + mx (root) + include:c (a.test) + a (b.test) = 5
    expect(r.count).toBe(5);
    expect(r.voidLookups).toBe(0);
    expect(r.problems).toEqual([]);
    expect(r.tree.children.map((c) => c.domain).sort()).toEqual(["a.test", "b.test"]);
  });

  it("reports more than 10 lookups in plain English", async () => {
    const zone: Record<string, unknown> = {
      "TXT big.test": [`v=spf1 ${Array.from({ length: 6 }, (_, i) => `include:i${i}.test`).join(" ")} ~all`],
    };
    for (let i = 0; i < 6; i++) zone[`TXT i${i}.test`] = [`v=spf1 a:h${i}.test -all`];
    for (let i = 0; i < 6; i++) zone[`A h${i}.test`] = ["1.1.1.1"];
    const r = await countSpfLookups("big.test", { resolver: fakeResolver(zone) });
    expect(r.count).toBe(12);
    const p = r.problems.find((x) => x.code === "spf-too-many-lookups")!;
    expect(p.message).toMatch(/12 DNS lookups; the limit is 10/);
  });

  it("detects include cycles without hanging", async () => {
    const resolver = fakeResolver({
      "TXT loop.test": ["v=spf1 include:x.test -all"],
      "TXT x.test": ["v=spf1 include:y.test -all"],
      "TXT y.test": ["v=spf1 include:loop.test -all"],
    });
    const r = await countSpfLookups("loop.test", { resolver });
    expect(codes(r.problems)).toContain("spf-loop");
    expect(r.count).toBe(3);
  });

  it("counts void lookups and missing include targets", async () => {
    const resolver = fakeResolver({
      "TXT v.test": ["v=spf1 include:gone1.test include:gone2.test a:nohost.test mx:nomx.test -all"],
    });
    const r = await countSpfLookups("v.test", { resolver });
    expect(r.voidLookups).toBe(4);
    expect(codes(r.problems)).toEqual(expect.arrayContaining(["spf-include-missing", "spf-void-lookups"]));
  });

  it("can analyse a record before it is published", async () => {
    const resolver = fakeResolver({ "TXT _spf.google.com": ["v=spf1 ip4:74.125.0.0/16 ~all"] });
    const r = await countSpfLookups("new.test", { resolver, record: "v=spf1 include:_spf.google.com ~all" });
    expect(r.count).toBe(1);
  });
});

describe("evaluateSpf", () => {
  const zone = {
    "TXT ex.test": ["v=spf1 ip4:192.0.2.0/24 include:inc.test a:web.ex.test mx ~all"],
    "TXT inc.test": ["v=spf1 ip6:2001:db8::/32 -all"],
    "A web.ex.test": ["198.51.100.7"],
    "MX ex.test": [{ exchange: "mx.ex.test", priority: 10 }],
    "A mx.ex.test": ["203.0.113.9"],
    "TXT redir.test": ["v=spf1 redirect=ex.test"],
    "TXT ex2.test": ["v=spf1 exists:%{i}.bl.test -all"],
  };
  const resolver = fakeResolver(zone);
  it("matches ip4 CIDR, include ip6, a and mx", async () => {
    expect((await evaluateSpf("192.0.2.55", "ex.test", { resolver })).result).toBe("pass");
    expect((await evaluateSpf("2001:db8::1", "ex.test", { resolver })).mechanism).toBe("include:inc.test");
    expect((await evaluateSpf("198.51.100.7", "ex.test", { resolver })).mechanism).toBe("a:web.ex.test");
    expect((await evaluateSpf("203.0.113.9", "ex.test", { resolver })).mechanism).toBe("mx");
  });
  it("falls through to ~all → softfail, and follows redirect", async () => {
    expect((await evaluateSpf("8.8.8.8", "ex.test", { resolver })).result).toBe("softfail");
    expect((await evaluateSpf("192.0.2.1", "redir.test", { resolver })).result).toBe("pass");
  });
  it("returns none without a record and notes unsupported exists", async () => {
    expect((await evaluateSpf("1.1.1.1", "nothing.test", { resolver })).result).toBe("none");
    const e = await evaluateSpf("1.1.1.1", "ex2.test", { resolver });
    expect(e.result).toBe("fail");
    expect(e.notes.join(" ")).toMatch(/not supported/);
  });
});

describe("ip helpers", () => {
  it("matches CIDRs for both families", () => {
    expect(cidrMatch("10.1.2.3", "10.0.0.0", 8)).toBe(true);
    expect(cidrMatch("11.1.2.3", "10.0.0.0", 8)).toBe(false);
    expect(cidrMatch("2001:db8:1::5", "2001:db8::", 32)).toBe(true);
    expect(cidrMatch("10.0.0.1", "2001:db8::", 32)).toBe(false);
    expect(parseIp6("::ffff:192.0.2.1")).toBe(0xffffc0000201n);
  });
});
