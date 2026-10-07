import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checkDomain } from "./check.js";
import { explain, explainReport } from "./explain.js";
import { generateRecords } from "./generate.js";
import { dohResolver } from "./resolver.js";
import type { MailDomainConfig } from "./types.js";
import { fakeFetch, fakeResolver, type Zone } from "./fake-dns.testutil.js";

const key = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "der" }).toString("base64");
const otherKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "der" }).toString("base64");

const cfg: MailDomainConfig = {
  domain: "acme.com",
  mailHost: "mx1.mail.lacspace.com",
  mxHosts: [{ host: "mx1.mail.lacspace.com", priority: 10 }, { host: "mx2.mail.lacspace.com", priority: 20 }],
  spfInclude: ["_spf.mail.lacspace.com"],
  spfAll: "-all",
  dkim: { selector: "lac1", publicKey: key },
  dmarc: { policy: "reject", rua: ["dmarc@acme.com"] },
  mtaSts: { mode: "enforce", mx: ["*.mail.lacspace.com"] },
  tlsRpt: { rua: ["tls@acme.com"] },
};

/** Publish generateRecords() output into a fake zone — exactly what a user would do. */
function zoneFrom(c: MailDomainConfig): { zone: Zone; files: Record<string, string> } {
  const g = generateRecords(c);
  const zone: Zone = {
    "TXT _spf.mail.lacspace.com": ["v=spf1 ip4:203.0.113.0/24 ip6:2001:db8:10::/48 -all"],
    "A mx1.mail.lacspace.com": ["203.0.113.10"],
    "A mx2.mail.lacspace.com": ["203.0.113.11"],
  };
  for (const r of g.records) {
    const k = `${r.type} ${r.fqdn}`;
    if (r.type === "MX") zone[k] = [...((zone[k] as unknown[]) ?? []), { exchange: r.value, priority: r.priority }];
    else if (r.type === "TXT") zone[k] = [...((zone[k] as unknown[]) ?? []), r.chunks ?? r.value];
    else zone[k] = [r.value];
  }
  return { zone, files: g.mtaStsPolicyFile ? { [g.mtaStsPolicyFile.url]: g.mtaStsPolicyFile.body } : {} };
}

describe("checkDomain end-to-end", () => {
  it("scores a fully configured domain 100 with no fixes", async () => {
    const { zone, files } = zoneFrom(cfg);
    const r = await checkDomain("acme.com", { expect: cfg, resolver: fakeResolver(zone), fetch: fakeFetch(files) });
    expect(r.fixes).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.score).toBe(100);
    expect(r.checks.mx.status).toBe("pass");
    expect(r.checks.spf.details).toMatchObject({ lookups: 1, voidLookups: 0 });
    expect(r.checks.dkim[0]).toMatchObject({ selector: "lac1", status: "pass", details: { keyBits: 2048 } });
    expect(r.checks.mtaSts.details).toMatchObject({ policy: { mode: "enforce" } });
    expect(explainReport(r)).toMatch(/^acme\.com is ready to send and receive email \(score 100\/100\)/);
  });

  it("explains a broken domain with specific fixes", async () => {
    const zone: Zone = {
      "MX acme.com": [{ exchange: "mx.oldhost.net", priority: 10 }],
      "A mx.oldhost.net": ["198.51.100.1"],
      "TXT acme.com": ["v=spf1 include:_spf.oldhost.net ~all", "v=spf1 include:_spf.mail.lacspace.com ~all", "v=DMARC1; p=none"],
      "TXT lac1._domainkey.acme.com": [`v=DKIM1; k=rsa; p=${otherKey}`],
      "TXT _mta-sts.acme.com": ["v=STSv1; id=1"],
    };
    const r = await checkDomain("acme.com", {
      expect: cfg,
      resolver: fakeResolver(zone),
      fetch: fakeFetch({ "https://mta-sts.acme.com/.well-known/mta-sts.txt": { status: 404 } }),
    });
    expect(r.ok).toBe(false);
    expect(r.score).toBeLessThan(30);
    const all = r.fixes.join("\n");
    expect(all).toMatch(/Add an MX record at @ pointing to mx1\.mail\.lacspace\.com with priority 10/);
    expect(all).toMatch(/also has MX records for mx\.oldhost\.net/);
    expect(all).toMatch(/You have 2 SPF records/);
    expect(all).toMatch(/DKIM key at lac1\._domainkey is different/);
    expect(all).toMatch(/DMARC record is on your main domain \(@\) instead of "_dmarc"/);
    expect(all).toMatch(/returned HTTP 404/);
    expect(all).toMatch(/Add a TXT record named _smtp\._tls/);
    expect(r.checks.spf.status).toBe("fail");
    expect(r.checks.dmarc.status).toBe("missing");
    // errors come before warnings
    expect(r.fixes.findIndex((f) => /also has MX/.test(f))).toBeGreaterThan(r.fixes.findIndex((f) => /Add an MX record/.test(f)));
  });

  it("works with no expectations and finds DKIM by common selector", async () => {
    const zone: Zone = {
      "MX shop.test": [{ exchange: "mx1.hostinger.com", priority: 5 }, { exchange: "mx2.hostinger.com", priority: 10 }],
      "A mx1.hostinger.com": ["172.65.182.103"],
      "A mx2.hostinger.com": ["172.65.182.103"],
      "TXT shop.test": ["v=spf1 include:_spf.mail.hostinger.com ~all"],
      "TXT _spf.mail.hostinger.com": ["v=spf1 include:relay.mail.hostinger.com ~all"],
      "TXT relay.mail.hostinger.com": ["v=spf1 ip4:172.65.0.0/16 ~all"],
      "TXT hostingermail-a._domainkey.shop.test": [`v=DKIM1;k=rsa;p=${key}`],
      "TXT hostingermail-b._domainkey.shop.test": ["v=DKIM1;p="],
      "TXT _dmarc.shop.test": ["v=DMARC1; p=none"],
    };
    const r = await checkDomain("shop.test", { resolver: fakeResolver(zone), fetch: fakeFetch({}) });
    expect(r.ok).toBe(true);
    expect(r.providers).toEqual(["hostinger"]);
    expect(r.score).toBe(80); // 25 + 25 + 20 + 10 (p=none) + 0 + 0
    expect(r.checks.dkim.map((c) => `${c.selector}:${c.status}`)).toEqual(["hostingermail-a:pass", "hostingermail-b:warn"]);
    expect(r.fixes.some((f) => /p=none/.test(f))).toBe(true);
    expect(r.fixes.some((f) => /hostingermail-b/.test(f))).toBe(false);
  });

  it("works over DNS-over-HTTPS with an injected fetch", async () => {
    const answers: Record<string, unknown> = {
      "doh.test/MX": { Status: 0, Answer: [{ type: 15, data: "10 mx.doh.test." }] },
      "mx.doh.test/A": { Status: 0, Answer: [{ type: 1, data: "192.0.2.25" }] },
      "doh.test/TXT": { Status: 0, Answer: [{ type: 16, data: '"v=spf1 ip4:192.0.2.0/24 -all"' }] },
      "_dmarc.doh.test/TXT": { Status: 0, Answer: [{ type: 16, data: '"v=DMARC1; p=reject; rua=mailto:d@doh.test"' }] },
      "default._domainkey.doh.test/TXT": { Status: 0, Answer: [{ type: 16, data: `"v=DKIM1; p=${key.slice(0, 200)}" "${key.slice(200)}"` }] },
    };
    const urls: string[] = [];
    const fetch = async (url: string) => {
      urls.push(url);
      const u = new URL(url);
      const body = answers[`${u.searchParams.get("name")}/${u.searchParams.get("type")}`] ?? { Status: 3 };
      return { ok: true, status: 200, headers: { get: () => "application/dns-json" }, text: async () => JSON.stringify(body) };
    };
    const r = await checkDomain("doh.test", { doh: "https://dns.google/resolve", fetch });
    expect(urls[0]).toMatch(/^https:\/\/dns\.google\/resolve\?name=/);
    expect(r.checks.mx.status).toBe("pass");
    expect(r.checks.spf.status).toBe("pass");
    expect(r.checks.dmarc.status).toBe("pass");
    expect(r.checks.dkim[0]).toMatchObject({ selector: "default", status: "pass" });
    expect(r.score).toBe(90);
    const res = dohResolver("https://cloudflare-dns.com/dns-query", { fetch });
    await expect(res.resolveTxt("nope.test")).rejects.toMatchObject({ code: "ENOTFOUND" });
  });
});

describe("individual checks via checkDomain", () => {
  const run = (zone: Zone, opts: Parameters<typeof checkDomain>[1] = {}) =>
    checkDomain("x.test", { resolver: fakeResolver(zone), fetch: fakeFetch({}), ...opts });
  const codesOf = (c: { problems: { code: string }[] }) => c.problems.map((p) => p.code);

  it("MX: null MX, CNAME target, unresolvable host, IP literal", async () => {
    expect(codesOf((await run({ "MX x.test": [{ exchange: ".", priority: 0 }] })).checks.mx)).toEqual(["mx-null"]);
    const r = await run({
      "MX x.test": [{ exchange: "alias.x.test", priority: 10 }, { exchange: "ghost.x.test", priority: 20 }, { exchange: "192.0.2.1", priority: 30 }],
      "CNAME alias.x.test": ["real.mx.test"],
      "A alias.x.test": ["192.0.2.9"],
    });
    expect(codesOf(r.checks.mx).sort()).toEqual(["mx-cname", "mx-ip", "mx-unresolvable"]);
    expect(r.checks.mx.status).toBe("fail");
  });

  it("MX: missing records and DNS errors", async () => {
    expect((await run({})).checks.mx.status).toBe("missing");
    const r = await checkDomain("x.test", { resolver: fakeResolver({}, { fail: ["MX x.test"] }), fetch: fakeFetch({}) });
    expect(r.checks.mx.status).toBe("error");
  });

  it("DMARC: multiple records, doubled name, unauthorised external rua", async () => {
    expect((await run({ "TXT _dmarc.x.test": ["v=DMARC1; p=none", "v=DMARC1; p=reject"] })).checks.dmarc.status).toBe("fail");
    expect(codesOf((await run({ "TXT _dmarc.x.test.x.test": ["v=DMARC1; p=none"] })).checks.dmarc)).toContain("dmarc-doubled-name");
    const ext = await run({ "TXT _dmarc.x.test": ["v=DMARC1; p=reject; rua=mailto:r@vendor.io"] });
    expect(codesOf(ext.checks.dmarc)).toContain("dmarc-rua-unauthorized");
    const ok = await run({ "TXT _dmarc.x.test": ["v=DMARC1; p=reject; rua=mailto:r@vendor.io"], "TXT x.test._report._dmarc.vendor.io": ["v=DMARC1"] });
    expect(ok.checks.dmarc.status).toBe("pass");
  });

  it("SPF: missing record with an expected value tells you exactly what to add", async () => {
    const r = await run({ "TXT x.test": ["spf1 include:foo.com"] }, { expect: { spfInclude: ["_spf.mail.lacspace.com"] } });
    expect(r.checks.spf.status).toBe("missing");
    expect(r.checks.spf.problems[0]!.message).toContain("v=spf1 include:_spf.mail.lacspace.com ~all");
    expect(codesOf(r.checks.spf)).toContain("spf-typo");
  });

  it("DKIM: expected selector missing, and nothing found at all", async () => {
    const r = await run({}, { expect: { dkim: { selector: "lac1", publicKey: key } } });
    expect(r.checks.dkim[0]).toMatchObject({ selector: "lac1", status: "missing" });
    expect(r.checks.dkim[0]!.problems[0]!.message).toContain("lac1._domainkey");
    const none = await run({});
    expect(codesOf(none.checks.dkim[0]!)).toEqual(["dkim-not-found"]);
  });

  it("DKIM: only revoked keys found does not count as working", async () => {
    const r = await run({ "TXT 20230601._domainkey.x.test": ["v=DKIM1; k=rsa; p="] });
    expect(r.checks.dkim[0]!.problems[0]!.code).toBe("dkim-only-revoked");
    expect(r.fixes.some((f) => /only found revoked DKIM keys \(20230601\)/.test(f))).toBe(true);
  });

  it("MTA-STS: enforce policy not covering an MX host is an error", async () => {
    const r = await run(
      {
        "MX x.test": [{ exchange: "mx1.x.test", priority: 10 }, { exchange: "backup.other.net", priority: 20 }],
        "A mx1.x.test": ["192.0.2.1"],
        "A backup.other.net": ["192.0.2.2"],
        "TXT _mta-sts.x.test": ["v=STSv1; id=2026"],
      },
      { fetch: fakeFetch({ "https://mta-sts.x.test/.well-known/mta-sts.txt": "version: STSv1\nmode: enforce\nmx: *.x.test\nmax_age: 604800\n" }) },
    );
    expect(r.checks.mtaSts.status).toBe("fail");
    expect(r.checks.mtaSts.problems[0]!.message).toMatch(/doesn't list backup\.other\.net/);
  });

  it("explain() renders a non-technical summary", async () => {
    const r = await run({ "TXT x.test": ["v=spf1 +all"] });
    const text = explain(r.checks.spf);
    expect(text).toMatch(/^Allowed senders \(SPF\): Broken: this needs fixing\./);
    expect(text).toMatch(/lets every server on the internet send email as you/);
  });

  it("caches lookups so shared names are queried once", async () => {
    const res = fakeResolver({ "TXT x.test": ["v=spf1 include:a.test include:a.test -all"], "TXT a.test": ["v=spf1 -all"] });
    await checkDomain("x.test", { resolver: res, fetch: fakeFetch({}) });
    expect(res.calls.filter((c) => c === "TXT a.test")).toHaveLength(1);
    expect(res.calls.filter((c) => c === "TXT x.test")).toHaveLength(1);
  });
});
