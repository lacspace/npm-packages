import { describe, expect, it } from "vitest";
import {
  ONE_CLICK_BODY,
  decodeEncodedWords,
  mailtoUnsubscribe,
  oneClickUnsubscribe,
  parseListHeaders,
  parseListId,
  parseListUnsubscribe,
  unsubscribeOptions,
} from "./index";

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(responses: Array<{ status: number; location?: string } | Error>, calls: Call[] = []) {
  let i = 0;
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses[Math.min(i++, responses.length - 1)]!;
    if (r instanceof Error) throw r;
    const headers = new Headers();
    if (r.location) headers.set("location", r.location);
    return new Response(r.status === 204 || (r.status >= 300 && r.status < 400) ? null : "ok", {
      status: r.status,
      headers,
    });
  }) as unknown as typeof fetch;
  return { fetch: f, calls };
}

describe("parseListUnsubscribe", () => {
  it("Gmail-style: mailto + https with one-click Post", () => {
    const r = parseListUnsubscribe(
      "<mailto:unsub-abc@news.example.com?subject=unsubscribe>, <https://news.example.com/u/abc123>",
      "List-Unsubscribe=One-Click",
    );
    expect(r.https).toEqual(["https://news.example.com/u/abc123"]);
    expect(r.mailto).toEqual([{ to: "unsub-abc@news.example.com", subject: "unsubscribe" }]);
    expect(r.oneClick).toBe(true);
    expect(r.http).toEqual([]);
  });

  it("Mailchimp-style: folded header with long https URL and mailto", () => {
    const raw =
      "<https://example.us1.list-manage.com/unsubscribe?u=1a2b&id=3c4d&e=5e6f&c=7a8b>,\r\n <mailto:unsubscribe-mc.us1_1a2b.3c4d@mailin1.example.com?subject=unsubscribe>";
    const r = parseListUnsubscribe(raw, "List-Unsubscribe=One-Click");
    expect(r.https).toEqual(["https://example.us1.list-manage.com/unsubscribe?u=1a2b&id=3c4d&e=5e6f&c=7a8b"]);
    expect(r.mailto[0]!.to).toBe("unsubscribe-mc.us1_1a2b.3c4d@mailin1.example.com");
    expect(r.raw).toBe(raw);
  });

  it("SendGrid-style: URL folded across lines inside brackets", () => {
    const r = parseListUnsubscribe("<https://u123.ct.sendgrid.example/lu/unsubscribe?oc=abc\r\n\tdef&n=1>", null);
    expect(r.https).toEqual(["https://u123.ct.sendgrid.example/lu/unsubscribe?oc=abcdef&n=1"]);
    expect(r.oneClick).toBe(false);
  });

  it("Substack-style: https only, lowercase post value with spaces", () => {
    const r = parseListUnsubscribe("<https://writer.substack.example/action/disable_email?token=xyz>", "  list-unsubscribe = one-click ");
    expect(r.oneClick).toBe(true);
  });

  it("wrong Post value is not one-click", () => {
    expect(parseListUnsubscribe("<https://x.example/u>", "List-Unsubscribe=One-Click-Maybe").oneClick).toBe(false);
    expect(parseListUnsubscribe("<https://x.example/u>", "One-Click").oneClick).toBe(false);
    expect(parseListUnsubscribe("<https://x.example/u>", "").oneClick).toBe(false);
    expect(parseListUnsubscribe("<https://x.example/u>").oneClick).toBe(false);
  });

  it("http-only list never gets oneClick", () => {
    const r = parseListUnsubscribe("<http://insecure.example/u?id=1>", "List-Unsubscribe=One-Click");
    expect(r.http).toEqual(["http://insecure.example/u?id=1"]);
    expect(r.https).toEqual([]);
    expect(r.oneClick).toBe(false);
  });

  it("decodes percent-encoded mailto subject/body, multiple recipients and cc", () => {
    const r = parseListUnsubscribe(
      "<mailto:a@list.example,b@list.example?subject=Remove%20me%20please&body=unsubscribe%20me%0Athanks&cc=c%40list.example>",
    );
    expect(r.mailto).toEqual([
      { to: "a@list.example, b@list.example", subject: "Remove me please", body: "unsubscribe me\nthanks", cc: "c@list.example" },
    ]);
  });

  it("mailto with to= query recipient and stray % is tolerated", () => {
    const r = parseListUnsubscribe("<mailto:?to=leave%40list.example&subject=100%off%20bye>");
    expect(r.mailto[0]!.to).toBe("leave@list.example");
    expect(r.mailto[0]!.subject).toBe("100%off bye");
  });

  it("strips comments, ignores junk, dedupes", () => {
    const r = parseListUnsubscribe(
      "(Use this) <https://a.example/u>, <ftp://x.example/u>, <relative/path>, <mailto:no-at-sign>, <https://a.example/u>, <javascript:alert(1)>, <mailto:u@a.example>, <MAILTO:U@A.EXAMPLE> (dupe)",
    );
    expect(r.https).toEqual(["https://a.example/u"]);
    expect(r.mailto).toEqual([{ to: "u@a.example" }]);
  });

  it("keeps several distinct https URLs in order", () => {
    const r = parseListUnsubscribe("<https://one.example/u>,<https://two.example/u>");
    expect(r.https).toEqual(["https://one.example/u", "https://two.example/u"]);
  });

  it("bracketless value falls back to comma split (like @lacspace/mime)", () => {
    const r = parseListUnsubscribe("https://a.example/u, mailto:x@a.example");
    expect(r.https).toEqual(["https://a.example/u"]);
    expect(r.mailto[0]!.to).toBe("x@a.example");
  });

  it("empty / null input", () => {
    expect(parseListUnsubscribe(null)).toEqual({ https: [], http: [], mailto: [], raw: "", oneClick: false });
    expect(parseListUnsubscribe("   ").https).toEqual([]);
  });
});

describe("mailtoUnsubscribe", () => {
  it("defaults subject and text to 'unsubscribe'", () => {
    expect(mailtoUnsubscribe({ to: "u@a.example" })).toEqual({ to: "u@a.example", subject: "unsubscribe", text: "unsubscribe" });
  });
  it("keeps given subject/body/cc", () => {
    expect(mailtoUnsubscribe({ to: "u@a.example", subject: "leave", body: "remove me", cc: "c@a.example" })).toEqual({
      to: "u@a.example",
      subject: "leave",
      text: "remove me",
      cc: "c@a.example",
    });
  });
});

describe("oneClickUnsubscribe — request shape", () => {
  it("POSTs the exact body with form content type, no credentials, manual redirect", async () => {
    const { fetch, calls } = fakeFetch([{ status: 200 }]);
    const r = await oneClickUnsubscribe("https://news.example.com/u/abc", { fetch, userAgent: "LacspaceMail/1.0" });
    expect(r).toEqual({ ok: true, status: 200 });
    expect(calls).toHaveLength(1);
    const init = calls[0]!.init;
    expect(calls[0]!.url).toBe("https://news.example.com/u/abc");
    expect(init.method).toBe("POST");
    expect(init.body).toBe("List-Unsubscribe=One-Click");
    expect(ONE_CLICK_BODY).toBe("List-Unsubscribe=One-Click");
    expect(init.credentials).toBe("omit");
    expect(init.redirect).toBe("manual");
    const h = init.headers as Record<string, string>;
    expect(h["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(h["User-Agent"]).toBe("LacspaceMail/1.0");
    expect(Object.keys(h).some((k) => k.toLowerCase() === "cookie")).toBe(false);
  });

  it("202 and 204 are ok", async () => {
    expect((await oneClickUnsubscribe("https://a.example/u", { fetch: fakeFetch([{ status: 202 }]).fetch })).ok).toBe(true);
    expect((await oneClickUnsubscribe("https://a.example/u", { fetch: fakeFetch([{ status: 204 }]).fetch })).ok).toBe(true);
  });

  it("4xx/5xx → http_error with status", async () => {
    expect(await oneClickUnsubscribe("https://a.example/u", { fetch: fakeFetch([{ status: 404 }]).fetch })).toMatchObject({
      ok: false,
      status: 404,
      error: "http_error",
    });
    expect((await oneClickUnsubscribe("https://a.example/u", { fetch: fakeFetch([{ status: 500 }]).fetch })).error).toBe("http_error");
  });

  it("thrown fetch → network", async () => {
    const r = await oneClickUnsubscribe("https://a.example/u", { fetch: fakeFetch([new TypeError("ECONNREFUSED")]).fetch });
    expect(r).toMatchObject({ ok: false, error: "network", detail: "ECONNREFUSED" });
  });

  it("rejects non-https", async () => {
    const { fetch, calls } = fakeFetch([{ status: 200 }]);
    expect((await oneClickUnsubscribe("http://a.example/u", { fetch })).error).toBe("not_https");
    expect((await oneClickUnsubscribe("mailto:x@a.example", { fetch })).error).toBe("not_https");
    expect((await oneClickUnsubscribe("not a url", { fetch })).error).toBe("not_https");
    expect(calls).toHaveLength(0);
  });
});

describe("oneClickUnsubscribe — SSRF guard", () => {
  const blocked = [
    "https://127.0.0.1/u",
    "https://10.1.2.3/u",
    "https://172.20.0.1/u",
    "https://192.168.1.1/u",
    "https://100.64.0.1/u",
    "https://169.254.169.254/latest/meta-data",
    "https://0x7f.0.0.1/u",
    "https://2130706433/u",
    "https://[::1]/u",
    "https://[fd00::1]/u",
    "https://[fe80::1]/u",
    "https://[::ffff:127.0.0.1]/u",
    "https://localhost/u",
    "https://api.localhost/u",
    "https://printer.local/u",
    "https://db.internal/u",
    "https://nas.lan/u",
    "https://intranet/u",
  ];
  for (const url of blocked) {
    it(`blocks ${url}`, async () => {
      const { fetch, calls } = fakeFetch([{ status: 200 }]);
      const r = await oneClickUnsubscribe(url, { fetch });
      expect(r.ok).toBe(false);
      expect(r.error).toBe("private_host");
      expect(calls).toHaveLength(0);
    });
  }

  it("blocks userinfo even with allowPrivateHosts", async () => {
    const { fetch } = fakeFetch([{ status: 200 }]);
    expect((await oneClickUnsubscribe("https://user:pw@a.example/u", { fetch })).error).toBe("private_host");
    expect((await oneClickUnsubscribe("https://user@a.example/u", { fetch, allowPrivateHosts: true })).error).toBe("private_host");
  });

  it("allowPrivateHosts lets intranet URLs through", async () => {
    const { fetch } = fakeFetch([{ status: 200 }]);
    expect((await oneClickUnsubscribe("https://127.0.0.1/u", { fetch, allowPrivateHosts: true })).ok).toBe(true);
  });

  it("public IP literals pass", async () => {
    const { fetch } = fakeFetch([{ status: 200 }]);
    expect((await oneClickUnsubscribe("https://93.184.216.34/u", { fetch })).ok).toBe(true);
    expect((await oneClickUnsubscribe("https://[2606:4700::1111]/u", { fetch })).ok).toBe(true);
  });

  it("resolveHost: private resolved IP blocks, public passes", async () => {
    const { fetch, calls } = fakeFetch([{ status: 200 }]);
    const bad = await oneClickUnsubscribe("https://rebind.example/u", { fetch, resolveHost: async () => ["93.184.216.34", "10.0.0.5"] });
    expect(bad).toMatchObject({ ok: false, error: "private_host" });
    expect(calls).toHaveLength(0);
    const good = await oneClickUnsubscribe("https://ok.example/u", { fetch, resolveHost: async () => ["93.184.216.34"] });
    expect(good.ok).toBe(true);
    const err = await oneClickUnsubscribe("https://nx.example/u", { fetch, resolveHost: async () => { throw new Error("ENOTFOUND"); } });
    expect(err.error).toBe("network");
  });
});

describe("oneClickUnsubscribe — redirects and timeouts", () => {
  it("follows https redirects keeping POST + body", async () => {
    const { fetch, calls } = fakeFetch([{ status: 302, location: "/step2" }, { status: 303, location: "https://b.example/done" }, { status: 200 }]);
    const r = await oneClickUnsubscribe("https://a.example/u", { fetch });
    expect(r).toEqual({ ok: true, status: 200 });
    expect(calls.map((c) => c.url)).toEqual(["https://a.example/u", "https://a.example/step2", "https://b.example/done"]);
    expect(calls.every((c) => c.init.method === "POST" && c.init.body === ONE_CLICK_BODY)).toBe(true);
  });

  it("refuses redirect to http or a private host", async () => {
    let r = await oneClickUnsubscribe("https://a.example/u", { fetch: fakeFetch([{ status: 301, location: "http://a.example/x" }]).fetch });
    expect(r.error).toBe("not_https");
    r = await oneClickUnsubscribe("https://a.example/u", {
      fetch: fakeFetch([{ status: 307, location: "https://169.254.169.254/latest" }]).fetch,
    });
    expect(r.error).toBe("private_host");
  });

  it("stops after 3 redirects", async () => {
    const { fetch, calls } = fakeFetch([{ status: 302, location: "https://a.example/loop" }]);
    const r = await oneClickUnsubscribe("https://a.example/u", { fetch });
    expect(r).toMatchObject({ ok: false, error: "http_error", status: 302 });
    expect(calls).toHaveLength(4);
  });

  it("3xx without Location is not ok", async () => {
    const r = await oneClickUnsubscribe("https://a.example/u", { fetch: fakeFetch([{ status: 302 }]).fetch });
    expect(r).toMatchObject({ ok: false, error: "http_error", status: 302 });
  });

  it("times out via its own timer", async () => {
    const hang = ((_u: string, init: RequestInit) =>
      new Promise((_res, rej) => {
        init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
      })) as unknown as typeof fetch;
    const r = await oneClickUnsubscribe("https://a.example/u", { fetch: hang, timeoutMs: 20 });
    expect(r).toMatchObject({ ok: false, error: "timeout" });
  });

  it("caller AbortSignal aborts (before and during)", async () => {
    const hang = ((_u: string, init: RequestInit) =>
      new Promise((_res, rej) => {
        init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
      })) as unknown as typeof fetch;
    const pre = new AbortController();
    pre.abort();
    expect(await oneClickUnsubscribe("https://a.example/u", { fetch: hang, signal: pre.signal })).toMatchObject({ error: "timeout", detail: "aborted" });
    const ctrl = new AbortController();
    const p = oneClickUnsubscribe("https://a.example/u", { fetch: hang, signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 5);
    expect(await p).toMatchObject({ ok: false, error: "timeout", detail: "aborted" });
  });
});

describe("parseListId", () => {
  it("name + id", () => {
    expect(parseListId("Weekly Digest <digest.example.com>")).toEqual({ name: "Weekly Digest", id: "digest.example.com" });
  });
  it("quoted name with escapes", () => {
    expect(parseListId('"Dev \\"Core\\" List" <dev.lists.example.org>')).toEqual({ name: 'Dev "Core" List', id: "dev.lists.example.org" });
  });
  it("RFC 2047 encoded name (B and Q)", () => {
    expect(parseListId("=?UTF-8?B?4KS44KSu4KS+4KSa4KS+4KSw?= <news.example.np>")).toEqual({ name: "समाचार", id: "news.example.np" });
    expect(parseListId("=?ISO-8859-1?Q?Caf=E9_News?= <cafe.example>")).toEqual({ name: "Café News", id: "cafe.example" });
    expect(decodeEncodedWords("=?UTF-8?Q?a?= =?UTF-8?Q?b?=")).toBe("ab");
  });
  it("missing name, bare id, comments, empty", () => {
    expect(parseListId("<only.id.example>")).toEqual({ id: "only.id.example" });
    expect(parseListId("bare.id.example")).toEqual({ id: "bare.id.example" });
    expect(parseListId("Announce (official) <announce.example>")).toEqual({ name: "Announce", id: "announce.example" });
    expect(parseListId("")).toBeNull();
    expect(parseListId(undefined)).toBeNull();
  });
});

describe("unsubscribeOptions / parseListHeaders", () => {
  it("one-click wins", () => {
    const o = unsubscribeOptions({
      "List-Unsubscribe": "<mailto:u@a.example>, <https://a.example/u>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "List-Id": "A News <news.a.example>",
    });
    expect(o.method).toBe("one-click");
    expect(o.url).toBe("https://a.example/u");
    expect(o.listId).toEqual({ name: "A News", id: "news.a.example" });
  });

  it("mailto beats a plain https link", () => {
    const h = new Headers({ "List-Unsubscribe": "<https://a.example/u>, <mailto:u@a.example?subject=stop>" });
    const o = unsubscribeOptions(h);
    expect(o.method).toBe("mailto");
    expect(o.mailto).toEqual({ to: "u@a.example", subject: "stop", text: "unsubscribe" });
    expect(o.url).toBeUndefined();
  });

  it("https when nothing better; none for http-only or missing", () => {
    expect(unsubscribeOptions({ "list-unsubscribe": "<https://a.example/u>" })).toMatchObject({ method: "https", url: "https://a.example/u" });
    const httpOnly = unsubscribeOptions({ "List-Unsubscribe": "<http://a.example/u>" });
    expect(httpOnly.method).toBe("none");
    expect(httpOnly.listUnsubscribe.http).toEqual(["http://a.example/u"]);
    expect(unsubscribeOptions({}).method).toBe("none");
  });

  it("parseListHeaders reads all RFC 2369 headers via a get() source", () => {
    const map = new Map<string, string>([
      ["list-id", "<dev.example.org>"],
      ["list-unsubscribe", "<https://lists.example.org/u?x=1>"],
      ["list-unsubscribe-post", "List-Unsubscribe=One-Click"],
      ["list-help", "<mailto:dev-request@example.org?subject=help> (List Instructions)"],
      ["list-subscribe", "<https://lists.example.org/sub>, <mailto:dev-join@example.org>"],
      ["list-post", "NO (posting not allowed)"],
      ["list-owner", "<mailto:owner@example.org>"],
      ["list-archive", "<https://lists.example.org/archive/>"],
    ]);
    const r = parseListHeaders(map);
    expect(r.listId).toEqual({ id: "dev.example.org" });
    expect(r.unsubscribe!.oneClick).toBe(true);
    expect(r.help!.mailto).toEqual([{ to: "dev-request@example.org", subject: "help" }]);
    expect(r.subscribe!.https).toEqual(["https://lists.example.org/sub"]);
    expect(r.subscribe!.mailto[0]!.to).toBe("dev-join@example.org");
    expect(r.post!.no).toBe(true);
    expect(r.owner!.mailto[0]!.to).toBe("owner@example.org");
    expect(r.archive!.https).toEqual(["https://lists.example.org/archive/"]);
    expect(parseListHeaders({}).unsubscribe).toBeNull();
  });
});
