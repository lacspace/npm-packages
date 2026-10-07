import { describe, expect, it } from "vitest";
import { RULES, SPAM_PHRASES, lint, lintEmail, spamPhrases } from "./index";
import type { LintInput, LintOptions } from "./index";
import { analyzeHtml, decodeEntities, tokenize } from "./html";

const LOREM =
  "This month we shipped faster search, a calmer inbox layout and better keyboard shortcuts. " +
  "Thank you to everyone who sent feedback after the last release. Read the full notes on our blog, " +
  "and reply to this email if anything feels slow or confusing. We read every message and use it to plan the next release.";

const CLEAN_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>October update</title>
<style>p { margin: 0 0 12px; } .btn { background-color: #1a56db; color: #ffffff; }</style></head>
<body style="background-color:#ffffff;color:#111111">
<div style="display:none;max-height:0;overflow:hidden">Faster search, calmer inbox and new shortcuts.&zwnj;&nbsp;&zwnj;&nbsp;</div>
<table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td>
<img src="https://cdn.lacspace.com/mail/header.png" width="600" height="200" alt="Lacspace October update">
<p>${LOREM}</p>
<p><a href="https://lacspace.com/blog/october">Read the release notes</a></p>
<p>Visit <a href="https://www.lacspace.com/mail">lacspace.com/mail</a> to try it.</p>
</td></tr>
<tr><td style="font-size:12px;color:#666666">
<p>Lacspace, 12 Durbar Marg, Kathmandu 44600, Nepal</p>
<p><a href="https://lacspace.com/unsubscribe?u=abc">Unsubscribe</a></p>
</td></tr></table>
<img src="https://t.lacspace.com/o.gif" width="1" height="1" alt="">
</body></html>`;

const CLEAN: LintInput = {
  html: CLEAN_HTML,
  text: `${LOREM}\n\nUnsubscribe: https://lacspace.com/unsubscribe?u=abc\nLacspace, 12 Durbar Marg, Kathmandu 44600, Nepal`,
  subject: "Your October product update",
  from: "Lacspace <news@lacspace.com>",
  bulk: true,
  headers: {
    "List-Unsubscribe": "<https://lacspace.com/u/abc>, <mailto:unsub@lacspace.com>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  },
};

const SPAMMY: LintInput = {
  subject: "CONGRATULATIONS!!! YOU WON $$$ CLAIM YOUR PRIZE",
  from: "noreply@prizes.example",
  bulk: true,
  html: `<html><body>
<script>track()</script>
<a href="http://bit.ly/abc"><img src="http://198.51.100.7/banner.jpg"></a>
<p style="color:#ffffff;background-color:#ffffff">cheap viagra casino lottery bargain</p>
<p>ACT NOW!!! 100% FREE, RISK-FREE. Click here: <a href="http://198.51.100.7/x">www.paypal.com</a></p>
</body></html>`,
};

const ids = (input: LintInput, opts?: LintOptions) => lintEmail(input, opts).issues.map((i) => i.id);
const has = (input: LintInput, id: string, opts?: LintOptions) => ids(input, opts).includes(id);
const issue = (input: LintInput, id: string, opts?: LintOptions) => lintEmail(input, opts).issues.find((i) => i.id === id);
const body = (inner: string) => `<html><body>${inner}</body></html>`;

describe("overall grading", () => {
  it("grades a clean newsletter good", () => {
    const r = lintEmail(CLEAN);
    expect(r.issues).toEqual([]);
    expect(r.score).toBe(100);
    expect(r.grade).toBe("good");
  });

  it("grades a classic spammy email poor", () => {
    const r = lintEmail(SPAMMY);
    expect(r.grade).toBe("poor");
    expect(r.score).toBeLessThan(55);
    const found = r.issues.map((i) => i.id);
    for (const id of ["css.script", "links.shortener", "links.ip_address", "links.text_mismatch", "subject.all_caps", "subject.spammy", "body.hidden_text", "bulk.no_unsubscribe"]) {
      expect(found).toContain(id);
    }
  });

  it("sorts errors, then warnings, then info", () => {
    const sev = lintEmail(SPAMMY).issues.map((i) => i.severity);
    const order = { error: 0, warn: 1, info: 2 } as const;
    for (let k = 1; k < sev.length; k++) expect(order[sev[k]!]).toBeGreaterThanOrEqual(order[sev[k - 1]!]);
  });

  it("scores 100 - 20/8/2 per rule and clamps at 0", () => {
    const r = lintEmail({ subject: "" }); // subject.missing (warn)
    expect(r.score).toBe(92);
    expect(r.grade).toBe("good");
    expect(lintEmail(SPAMMY).score).toBeGreaterThanOrEqual(0);
  });

  it("grades fair between 55 and 79", () => {
    const r = lintEmail({ subject: "" }, { rules: { "subject.missing": "error" } });
    expect(r.score).toBe(80);
    const r2 = lintEmail({ subject: "", html: body(`<p>${LOREM}</p><script>x</script>`) }, { rules: { "subject.missing": "error" } });
    expect(r2.score).toBe(100 - 20 - 20 - 2); // subject, script, missing plain
    expect(r2.grade).toBe("fair");
  });

  it("lint === lintEmail", () => {
    expect(lint).toBe(lintEmail);
  });

  it("returns stats", () => {
    const s = lintEmail(CLEAN).stats;
    expect(s.sizeBytes).toBeGreaterThan(500);
    expect(s.imageCount).toBe(1); // tracking pixel excluded
    expect(s.linkCount).toBe(3);
    expect(s.wordCount).toBeGreaterThan(50);
    expect(s.textChars).toBeGreaterThan(200);
    expect(s.textToImageRatio).toBe(s.wordCount);
  });

  it("handles an empty input", () => {
    const r = lintEmail({});
    expect(r.score).toBe(100);
    expect(r.stats.wordCount).toBe(0);
  });

  it("exposes RULES for every id it can raise", () => {
    expect(Object.keys(RULES).length).toBe(41);
    for (const meta of Object.values(RULES)) {
      expect(["error", "warn", "info"]).toContain(meta.severity);
      expect(meta.description.length).toBeGreaterThan(10);
    }
  });
});

describe("size", () => {
  const sized = (bytes: number) => body(`<p>${LOREM}</p><!--${"x".repeat(bytes)}-->`);
  it("does not flag HTML under 90KB", () => {
    expect(has({ html: sized(80 * 1024) }, "html.too_large")).toBe(false);
  });
  it("warns between 90KB and 102KB", () => {
    const i = issue({ html: sized(95 * 1024) }, "html.too_large");
    expect(i?.severity).toBe("warn");
    expect(i?.clients).toEqual(["Gmail"]);
  });
  it("errors above 102KB (Gmail clipping)", () => {
    expect(issue({ html: sized(103 * 1024) }, "html.too_large")?.severity).toBe("error");
  });
  it("counts UTF-8 bytes, not characters", () => {
    const r = lintEmail({ html: "नमस्ते" });
    expect(r.stats.sizeBytes).toBe(18);
  });
  it("flags large attachments: warn above 10MB, error above 25MB", () => {
    expect(has({ attachments: [{ filename: "a.pdf", size: 5 * 1024 * 1024 }] }, "attachment.large")).toBe(false);
    expect(issue({ attachments: [{ filename: "a.pdf", size: 11 * 1024 * 1024 }] }, "attachment.large")?.severity).toBe("warn");
    expect(issue({ attachments: [{ filename: "a.pdf", size: 15 * 1024 * 1024 }, { filename: "b.pdf", size: 15 * 1024 * 1024 }] }, "attachment.large")?.severity).toBe("error");
  });
  it("flags risky attachment types", () => {
    const i = issue({ attachments: [{ filename: "setup.EXE", size: 10 }, { filename: "invoice.docm", size: 10 }, { filename: "ok.pdf", size: 10 }] }, "attachment.risky_type");
    expect(i?.count).toBe(2);
    expect(i?.severity).toBe("error");
    expect(has({ attachments: [{ filename: "report.pdf", size: 10 }, { filename: "data.json", size: 1 }] }, "attachment.risky_type")).toBe(false);
  });
});

describe("content", () => {
  it("text.missing_plain: HTML without text part", () => {
    expect(has({ html: body(`<p>${LOREM}</p>`) }, "text.missing_plain")).toBe(true);
    expect(has({ html: body(`<p>${LOREM}</p>`), text: LOREM }, "text.missing_plain")).toBe(false);
    expect(has({ text: LOREM }, "text.missing_plain")).toBe(false);
  });

  it("images.only", () => {
    const html = body(`<img src="https://x.com/a.png" alt="Sale" width="600" height="800">`);
    expect(issue({ html }, "images.only")?.severity).toBe("error");
    expect(has({ html: CLEAN_HTML }, "images.only")).toBe(false);
  });

  it("images.high_ratio", () => {
    const imgs = '<img src="https://x.com/a.png" alt="a" width="10" height="10">'.repeat(3);
    const html = body(`${imgs}<p>${"word ".repeat(30)}</p>`);
    expect(has({ html }, "images.high_ratio")).toBe(true);
    expect(has({ html }, "images.only")).toBe(false);
    expect(has({ html: CLEAN_HTML }, "images.high_ratio")).toBe(false);
  });

  it("images.missing_alt (alt=\"\" is fine)", () => {
    const html = body(`<p>${LOREM}</p><img src="https://x.com/a.png" width="1" height="5"><img src="https://x.com/b.png" alt="" width="5" height="5">`);
    expect(issue({ html }, "images.missing_alt")?.count).toBe(1);
    expect(has({ html: CLEAN_HTML }, "images.missing_alt")).toBe(false);
  });

  it("images.no_dimensions (style sizes count)", () => {
    const html = body(`<p>${LOREM}</p><img src="https://x.com/a.png" alt="a"><img src="https://x.com/b.png" alt="b" style="width:10px;height:10px">`);
    const i = issue({ html }, "images.no_dimensions");
    expect(i?.count).toBe(1);
    expect(i?.severity).toBe("info");
  });

  it("does not count 1x1 tracking pixels", () => {
    const html = body(`<p>${LOREM}</p><img src="https://t.x.com/p.gif" width="1" height="1">`);
    expect(lintEmail({ html }).stats.imageCount).toBe(0);
    expect(has({ html }, "images.missing_alt")).toBe(false);
  });

  it("images.base64 in <img> and CSS", () => {
    const html = body(`<p>${LOREM}</p><img src="data:image/png;base64,AAAA" alt="x" width="1" height="5"><div style="background-image:url('data:image/png;base64,BBBB')"></div>`);
    const i = issue({ html }, "images.base64");
    expect(i?.count).toBe(2);
    expect(i?.clients).toEqual(["Gmail"]);
    expect(has({ html: CLEAN_HTML }, "images.base64")).toBe(false);
  });
});

describe("links", () => {
  const withLink = (a: string) => body(`<p>${LOREM}</p>${a}`);

  it("links.text_mismatch: text shows another domain", () => {
    const i = issue({ html: withLink('<a href="https://evil.example.net/login">https://www.paypal.com/signin</a>') }, "links.text_mismatch");
    expect(i?.severity).toBe("error");
    expect(i?.sample).toContain("evil.example.net");
    expect(has({ html: withLink('<a href="https://evil.example.net">paypal.com</a>') }, "links.text_mismatch")).toBe(true);
  });

  it("links.text_mismatch: same registrable domain, words, files and emails are fine", () => {
    expect(has({ html: withLink('<a href="https://news.lacspace.com/x">www.lacspace.com</a>') }, "links.text_mismatch")).toBe(false);
    expect(has({ html: withLink('<a href="https://shop.example.co.uk/">example.co.uk</a>') }, "links.text_mismatch")).toBe(false);
    expect(has({ html: withLink('<a href="https://other.com/r.pdf">report.pdf</a>') }, "links.text_mismatch")).toBe(false);
    expect(has({ html: withLink('<a href="https://other.com/">Read the report</a>') }, "links.text_mismatch")).toBe(false);
    expect(has({ html: withLink('<a href="mailto:hi@lacspace.com">hi@lacspace.com</a>') }, "links.text_mismatch")).toBe(false);
  });

  it("links.text_mismatch: different second-level registrations differ", () => {
    expect(has({ html: withLink('<a href="https://evil.co.uk/">bank.co.uk</a>') }, "links.text_mismatch")).toBe(true);
  });

  it("links.shortener", () => {
    const i = issue({ html: withLink('<a href="https://bit.ly/x">here</a><a href="https://t.co/y">there</a>') }, "links.shortener");
    expect(i?.count).toBe(2);
    expect(i?.sample).toContain("bit.ly");
    expect(has({ html: withLink('<a href="https://notbit.ly.example.com/x">x</a>') }, "links.shortener")).toBe(false);
    expect(has({ text: "see https://tinyurl.com/abc" }, "links.shortener")).toBe(true);
  });

  it("links.ip_address", () => {
    expect(has({ html: withLink('<a href="https://203.0.113.9/login">Sign in</a>') }, "links.ip_address")).toBe(true);
    expect(has({ html: withLink('<a href="https://[2001:db8::1]/">x</a>') }, "links.ip_address")).toBe(true);
    expect(has({ html: withLink('<a href="https://lacspace.com/">x</a>') }, "links.ip_address")).toBe(false);
  });

  it("links.http_insecure", () => {
    expect(issue({ html: withLink('<a href="http://lacspace.com/">x</a>') }, "links.http_insecure")?.severity).toBe("info");
    expect(has({ html: withLink('<a href="https://lacspace.com/">x</a>') }, "links.http_insecure")).toBe(false);
    expect(has({ text: "go to http://lacspace.com now" }, "links.http_insecure")).toBe(true);
  });

  it("links.too_many (over 50)", () => {
    const many = (n: number) => withLink(Array.from({ length: n }, (_, k) => `<a href="https://lacspace.com/${k}">l${k}</a>`).join(" "));
    expect(issue({ html: many(51) }, "links.too_many")?.count).toBe(51);
    expect(has({ html: many(50) }, "links.too_many")).toBe(false);
  });

  it("links.javascript", () => {
    expect(issue({ html: withLink('<a href="  JavaScript:alert(1)">x</a>') }, "links.javascript")?.severity).toBe("error");
    expect(has({ html: withLink('<a href="https://lacspace.com/javascript">x</a>') }, "links.javascript")).toBe(false);
  });

  it("links.empty (named anchors without text are fine)", () => {
    expect(issue({ html: withLink('<a href="#">Shop</a><a href="">x</a><a>Go</a>') }, "links.empty")?.count).toBe(3);
    expect(has({ html: withLink('<a name="top"></a><a href="https://lacspace.com">ok</a>') }, "links.empty")).toBe(false);
  });
});

describe("subject", () => {
  it("subject.missing only when a subject is passed", () => {
    expect(has({ subject: "  " }, "subject.missing")).toBe(true);
    expect(has({ text: LOREM }, "subject.missing")).toBe(false);
    expect(has({ subject: "Hello" }, "subject.missing")).toBe(false);
  });
  it("subject.too_long (> 78 characters)", () => {
    expect(issue({ subject: "a".repeat(79) }, "subject.too_long")?.severity).toBe("warn");
    expect(has({ subject: "a".repeat(78) }, "subject.too_long")).toBe(false);
  });
  it("subject.all_caps", () => {
    expect(has({ subject: "HUGE NEWS FOR YOU TODAY" }, "subject.all_caps")).toBe(true);
    expect(has({ subject: "Your NEPSE and AI weekly digest" }, "subject.all_caps")).toBe(false);
  });
  it("subject.excess_punctuation", () => {
    expect(has({ subject: "Big news!!!" }, "subject.excess_punctuation")).toBe(true);
    expect(has({ subject: "Save $$$ today" }, "subject.excess_punctuation")).toBe(true);
    expect(has({ subject: "Big news!" }, "subject.excess_punctuation")).toBe(false);
    expect(has({ subject: "Price: $20" }, "subject.excess_punctuation")).toBe(false);
  });
  it("subject.spammy", () => {
    const i = issue({ subject: "Act now: claim your prize" }, "subject.spammy");
    expect(i?.sample).toContain("Act now");
    expect(has({ subject: "Minutes from Tuesday's meeting" }, "subject.spammy")).toBe(false);
  });
  it("subject.fake_reply only in bulk", () => {
    expect(has({ subject: "Re: your account", bulk: true }, "subject.fake_reply")).toBe(true);
    expect(has({ subject: "FWD: offer" }, "subject.fake_reply", { requireUnsubscribe: true })).toBe(true);
    expect(has({ subject: "Re: your account" }, "subject.fake_reply")).toBe(false);
    expect(has({ subject: "Regarding the plan", bulk: true }, "subject.fake_reply")).toBe(false);
  });
  it("subject.emoji_heavy", () => {
    expect(issue({ subject: "Sale 🔥🔥🎉 today" }, "subject.emoji_heavy")?.count).toBe(3);
    expect(has({ subject: "Sale 🎉 today" }, "subject.emoji_heavy")).toBe(false);
  });
  it("Unicode subjects: Devanagari is never ALL CAPS and length counts code points", () => {
    expect(has({ subject: "नयाँ सुविधाहरू यस महिना सार्वजनिक भए" }, "subject.all_caps")).toBe(false);
    expect(has({ subject: "😀".repeat(78) }, "subject.too_long")).toBe(false);
  });
});

describe("body", () => {
  it("body.spammy_phrases warns, escalates to error at 5", () => {
    expect(issue({ text: `${LOREM} Act now while supplies last.` }, "body.spammy_phrases")?.severity).toBe("warn");
    expect(issue({ text: "Act now! 100% free, risk-free, no obligation, buy now, cheap." }, "body.spammy_phrases")?.severity).toBe("error");
    expect(has({ text: LOREM }, "body.spammy_phrases")).toBe(false);
  });
  it("body.spammy_phrases ignores hidden and head text", () => {
    expect(has({ html: `<html><head><title>act now</title></head><body><p>${LOREM}</p></body></html>` }, "body.spammy_phrases")).toBe(false);
  });
  it("body.all_caps_ratio", () => {
    expect(has({ text: "THIS IS AN AMAZING DEAL YOU MUST SEE today and more words here" }, "body.all_caps_ratio")).toBe(true);
    expect(has({ text: LOREM + " NASA and the UN" }, "body.all_caps_ratio")).toBe(false);
  });
  it("body.excess_exclamation", () => {
    expect(has({ text: "Wow!! Great" }, "body.excess_exclamation")).toBe(true);
    expect(has({ text: "a! b! c! d! e! f!" }, "body.excess_exclamation")).toBe(true);
    expect(has({ text: "Thanks! See you soon!" }, "body.excess_exclamation")).toBe(false);
  });
  it("body.hidden_text: display:none, font-size:0 and same colour", () => {
    expect(has({ html: body(`<p>${LOREM}</p><div style="display:none">secret keywords</div>`) }, "body.hidden_text")).toBe(true);
    expect(has({ html: body(`<p>${LOREM}</p><span style="font-size:0px">stuffing</span>`) }, "body.hidden_text")).toBe(true);
    expect(has({ html: body(`<p>${LOREM}</p><td bgcolor="#FFF"><font color="white">invisible</font></td>`) }, "body.hidden_text")).toBe(true);
    expect(has({ html: body(`<div style="background:#000"><p style="color:rgb(0,0,0)">x</p></div><p>${LOREM}</p>`) }, "body.hidden_text")).toBe(true);
  });
  it("body.hidden_text: a single short preheader is fine", () => {
    expect(has({ html: CLEAN_HTML }, "body.hidden_text")).toBe(false);
    expect(has({ html: body(`<div style="display:none">${"x".repeat(160)}</div><p>${LOREM}</p>`) }, "body.hidden_text")).toBe(true);
    expect(has({ html: body(`<div style="display:none">Short preview</div><p>${LOREM}</p><div style="display:none">more hidden</div>`) }, "body.hidden_text")).toBe(true);
  });
  it("body.hidden_text: visible text on matching-but-different colours is fine", () => {
    expect(has({ html: body(`<div style="background-color:#000000;color:#ffffff">${LOREM}</div>`) }, "body.hidden_text")).toBe(false);
  });
});

describe("css / clients", () => {
  const h = (x: string) => ({ html: body(`<p>${LOREM}</p>${x}`), text: LOREM });
  it("css.script: <script> and on* handlers", () => {
    expect(issue(h("<script>alert(1)</script>"), "css.script")?.severity).toBe("error");
    expect(issue(h('<img src="https://x.com/a.png" alt="" width="5" height="5" onerror="x()">'), "css.script")?.count).toBe(1);
    expect(has(h("<p>javascript is a language</p>"), "css.script")).toBe(false);
  });
  it("css.external_stylesheet", () => {
    const i = issue({ html: `<html><head><link rel="stylesheet" href="https://x.com/s.css"></head><body><p>${LOREM}</p></body></html>` }, "css.external_stylesheet");
    expect(i?.clients).toEqual(["Gmail"]);
    expect(has({ html: `<html><head><link rel="icon" href="/f.ico"></head><body>x</body></html>` }, "css.external_stylesheet")).toBe(false);
  });
  it("css.import", () => {
    expect(has(h("<style>@import url('https://fonts.example/x.css');</style>"), "css.import")).toBe(true);
    expect(has(h("<style>p{color:red}</style>"), "css.import")).toBe(false);
  });
  it("css.layout_unsupported", () => {
    const i = issue(h('<div style="display: flex">a</div><style>.x{position:absolute}</style>'), "css.layout_unsupported");
    expect(i?.clients).toEqual(["Outlook (Windows)"]);
    expect(i?.count).toBe(2);
    expect(has(h('<div style="display:block;position:relative">a</div>'), "css.layout_unsupported")).toBe(false);
  });
  it("css.background_image (CSS only)", () => {
    expect(issue(h('<td style="background-image:url(https://x.com/bg.png)">a</td>'), "css.background_image")?.severity).toBe("info");
    expect(has(h('<td background="https://x.com/bg.png" style="background-color:#eee">a</td>'), "css.background_image")).toBe(false);
  });
  it("html.form", () => {
    expect(has(h('<form action="https://x.com"><input name="q"></form>'), "html.form")).toBe(true);
    expect(has(h("<p>fill in the form on our site</p>"), "html.form")).toBe(false);
  });
  it("html.embed", () => {
    const i = issue(h('<iframe src="https://x.com"></iframe><video src="a.mp4"></video>'), "html.embed");
    expect(i?.count).toBe(2);
    expect(i?.sample).toContain("<iframe>");
    expect(has(h("<p>watch the video</p>"), "html.embed")).toBe(false);
  });
  it("svg.inline", () => {
    expect(issue(h('<svg width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>'), "svg.inline")?.clients).toEqual(["Gmail"]);
    expect(has(h('<img src="https://x.com/logo.png" alt="logo" width="5" height="5">'), "svg.inline")).toBe(false);
  });
});

describe("compliance (bulk)", () => {
  const base = { html: CLEAN_HTML, text: CLEAN.text, subject: CLEAN.subject };
  const noFooter = body(`<div style="display:none">Preview</div><p>${LOREM}</p><p>12 Durbar Marg, Kathmandu</p>`);

  it("bulk.no_unsubscribe: neither header nor link", () => {
    expect(issue({ html: noFooter, text: LOREM, bulk: true }, "bulk.no_unsubscribe")?.severity).toBe("error");
  });
  it("bulk.no_unsubscribe is not raised for 1:1 mail", () => {
    expect(has({ html: noFooter, text: LOREM }, "bulk.no_unsubscribe")).toBe(false);
    expect(ids({ html: noFooter, text: LOREM }).filter((i) => i.startsWith("bulk."))).toEqual([]);
  });
  it("a visible unsubscribe link avoids no_unsubscribe but still lacks one-click", () => {
    const r = ids({ ...base, bulk: true });
    expect(r).not.toContain("bulk.no_unsubscribe");
    expect(issue({ ...base, bulk: true }, "bulk.no_one_click")?.message).toContain("no List-Unsubscribe header");
  });
  it("bulk.no_one_click: header without List-Unsubscribe-Post", () => {
    expect(has({ ...base, bulk: true, headers: { "list-unsubscribe": "<https://x.com/u>" } }, "bulk.no_one_click")).toBe(true);
  });
  it("bulk.no_one_click: mailto-only header", () => {
    expect(has({ ...base, bulk: true, headers: { "List-Unsubscribe": "<mailto:u@x.com>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }, "bulk.no_one_click")).toBe(true);
  });
  it("header names match case-insensitively and arrays are accepted", () => {
    const r = ids({ ...base, bulk: true, headers: { "LIST-UNSUBSCRIBE": ["<https://x.com/u>"], "list-unsubscribe-post": "List-Unsubscribe=One-Click" } });
    expect(r).not.toContain("bulk.no_one_click");
    expect(r).not.toContain("bulk.no_unsubscribe");
  });
  it("header alone satisfies no_unsubscribe even without a visible link", () => {
    expect(has({ html: noFooter, text: LOREM, bulk: true, headers: CLEAN.headers! }, "bulk.no_unsubscribe")).toBe(false);
  });
  it("bulk.no_postal_address", () => {
    expect(issue({ html: body(`<p>${LOREM}</p>`), text: LOREM, bulk: true, headers: CLEAN.headers! }, "bulk.no_postal_address")?.severity).toBe("info");
    expect(has({ ...base, bulk: true, headers: CLEAN.headers! }, "bulk.no_postal_address")).toBe(false);
    expect(has({ text: `${LOREM}\nPO Box 1234, Kathmandu\nunsubscribe: https://x.com/u`, bulk: true, headers: CLEAN.headers! }, "bulk.no_postal_address")).toBe(false);
  });
  it("preheader.missing in bulk HTML; input.preheader satisfies it", () => {
    const html = body(`<p>${LOREM}</p>`);
    expect(has({ html, bulk: true }, "preheader.missing")).toBe(true);
    expect(has({ html, bulk: true, preheader: "Faster search and more" }, "preheader.missing")).toBe(false);
    expect(has({ html }, "preheader.missing")).toBe(false);
  });
  it("opts.requireUnsubscribe turns on bulk mode", () => {
    expect(has({ html: noFooter, text: LOREM }, "bulk.no_unsubscribe", { requireUnsubscribe: true })).toBe(true);
  });
});

describe("other rules", () => {
  it("from.noreply", () => {
    expect(issue({ from: "Shop <no-reply@shop.example>" }, "from.noreply")?.severity).toBe("info");
    expect(has({ from: "donotreply@x.com" }, "from.noreply")).toBe(true);
    expect(has({ from: "Nora <nora@x.com>" }, "from.noreply")).toBe(false);
  });
  it("html.malformed: unclosed and stray tags", () => {
    const i = issue({ html: body(`<div><p>${LOREM}</p><table><tr><td>x</table>`), text: LOREM }, "html.malformed");
    expect(i?.severity).toBe("info");
    expect(i?.sample).toContain("<div>");
    expect(issue({ html: body("<div><div><div><div><span>x") }, "html.malformed")?.severity).toBe("warn");
    expect(has({ html: CLEAN_HTML }, "html.malformed")).toBe(false);
  });
  it("malformed HTML never throws", () => {
    const junk = [
      "<", "<<<>>>", "<a href=", '<a href="unterminated', "<!--", "<div <span>", "</>", "<script>", "<style>p{",
      "<img src=x alt='a", "&#xFFFFFFF; &bogus; &#0;", "<a\u0000b>", "<p>".repeat(5000), "</div>".repeat(100),
    ];
    for (const html of junk) expect(() => lintEmail({ html, subject: "x", bulk: true })).not.toThrow();
  });
});

describe("rules overrides", () => {
  it("turns a rule off", () => {
    expect(has({ subject: "" }, "subject.missing", { rules: { "subject.missing": "off" } })).toBe(false);
    expect(lintEmail({ subject: "" }, { rules: { "subject.missing": "off" } }).score).toBe(100);
  });
  it("changes severity and score follows", () => {
    const r = lintEmail({ html: body(`<p>${LOREM}</p>`) }, { rules: { "text.missing_plain": "error" } });
    expect(r.issues[0]?.severity).toBe("error");
    expect(r.score).toBe(80);
  });
  it("overrides escalated severities too", () => {
    const html = body(`<p>${LOREM}</p><!--${"x".repeat(110 * 1024)}-->`);
    expect(issue({ html }, "html.too_large", { rules: { "html.too_large": "info" } })?.severity).toBe("info");
  });
  it("ignores unknown rule ids", () => {
    expect(lintEmail(CLEAN, { rules: { "made.up": "error" } }).score).toBe(100);
  });
});

describe("Nepali locale", () => {
  it("translates key rules", () => {
    const i = issue({ html: body("<p>x</p>"), bulk: true }, "bulk.no_unsubscribe", { locale: "ne" });
    expect(i?.message).toMatch(/अनसब्स्क्राइब/);
    expect(i?.fix).toBeTruthy();
  });
  it("falls back to English for the rest", () => {
    expect(issue({ from: "noreply@x.com" }, "from.noreply", { locale: "ne" })?.message).toMatch(/no-reply/);
  });
});

describe("spamPhrases", () => {
  it("returns original casing, de-duplicated, in order", () => {
    expect(spamPhrases("ACT NOW and act now! Click Here to claim your prize")).toEqual(["ACT NOW", "Click Here", "claim your prize"]);
  });
  it("matches whole words only", () => {
    expect(spamPhrases("cheapest")).toEqual([]);
    expect(spamPhrases("you won't believe it")).toEqual([]);
    expect(spamPhrases("You won!")).toEqual(["You won"]);
  });
  it("tolerates extra whitespace and curly apostrophes", () => {
    expect(spamPhrases("Don’t   delete this")).toEqual(["Don’t   delete"]);
  });
  it("prefers the longer overlapping phrase", () => {
    expect(spamPhrases("A risk-free investment")).toEqual(["risk-free investment"]);
  });
  it("finds Nepali phrases, including with attached postpositions", () => {
    expect(spamPhrases("यो अफरमा निःशुल्क उपहार! तुरुन्त किन्नुहोस्")).toEqual(["अफर", "निःशुल्क", "तुरुन्त"]);
    expect(spamPhrases("तपाईंले जित्नुभयो")).toEqual(["जित्नुभयो"]);
  });
  it("returns [] for clean or empty text", () => {
    expect(spamPhrases("")).toEqual([]);
    expect(spamPhrases(LOREM)).toEqual([]);
  });
  it("SPAM_PHRASES is a non-empty list with Nepali entries", () => {
    expect(SPAM_PHRASES.length).toBeGreaterThan(50);
    expect(SPAM_PHRASES).toContain("निःशुल्क");
  });
});

describe("tokenizer", () => {
  it("decodes entities", () => {
    expect(decodeEntities("a &amp; b &lt;c&gt; &#x41;&#66; &nbsp;&unknown;")).toBe("a & b <c> AB  &unknown;");
  });
  it("reads attributes in all quoting styles", () => {
    const t = tokenize(`<a href=https://x.com title='t "q"' data-x="1" disabled>`);
    expect(t[0]).toEqual({ type: "start", name: "a", attrs: { href: "https://x.com", title: 't "q"', "data-x": "1", disabled: "" }, selfClosing: false });
  });
  it("keeps script/style contents raw", () => {
    const a = analyzeHtml("<style>a > b { color: red }</style><script>if (a < b) {}</script><p>hi</p>");
    expect(a.visibleText).toBe("hi");
    expect(a.css[0]).toContain("a > b");
  });
  it("ignores comments and conditional comments", () => {
    expect(analyzeHtml("<!--[if mso]><table><![endif]--><p>hi</p>").visibleText).toBe("hi");
  });
});
