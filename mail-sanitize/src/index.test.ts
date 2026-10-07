import { describe, expect, it } from "vitest";
import {
  DATA_SRC_ATTR,
  PLACEHOLDER_GIF,
  htmlToText,
  isTrackerUrl,
  sanitizeEmailHtml,
  snippet,
  textToHtml,
} from "./index";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("remote content", () => {
  it("blocks remote images by default and records them", () => {
    const r = sanitizeEmailHtml(`<img src="https://cdn.example.com/hero.jpg" width="600" alt="Hero">`);
    expect(r.html).toBe(`<img src="${PLACEHOLDER_GIF}" ${DATA_SRC_ATTR}="https://cdn.example.com/hero.jpg" width="600" alt="Hero">`);
    expect(r.blockedCount).toBe(1);
    expect(r.hasRemoteContent).toBe(true);
    expect(r.remoteUrls).toEqual(["https://cdn.example.com/hero.jpg"]);
  });

  it("upgrades protocol-relative image URLs to https", () => {
    const r = sanitizeEmailHtml(`<img src="//cdn.example.com/a.png" width="50" height="50">`);
    expect(r.remoteUrls).toEqual(["https://cdn.example.com/a.png"]);
  });

  it("keeps remote images when allowed, through proxyUrl", () => {
    const r = sanitizeEmailHtml(`<img src="https://cdn.example.com/a.png" width="40" height="40">`, {
      blockRemoteContent: false,
      proxyUrl: (u) => "/img-proxy?u=" + encodeURIComponent(u),
    });
    expect(r.html).toBe(`<img src="/img-proxy?u=https%3A%2F%2Fcdn.example.com%2Fa.png" width="40" height="40">`);
    expect(r.blockedCount).toBe(0);
    expect(r.hasRemoteContent).toBe(true);
  });

  it("keeps remote images verbatim when allowed without a proxy", () => {
    expect(sanitizeEmailHtml(`<img src="https://cdn.example.com/a.png">`, { blockRemoteContent: false }).html).toBe(
      `<img src="https://cdn.example.com/a.png">`,
    );
  });

  it("blocks when proxyUrl returns a dangerous URL or throws", () => {
    const bad = sanitizeEmailHtml(`<img src="https://a.example/x.png">`, { blockRemoteContent: false, proxyUrl: () => "javascript:alert(1)" });
    expect(bad.html).not.toMatch(/javascript:/i);
    const boom = sanitizeEmailHtml(`<img src="https://a.example/x.png">`, {
      blockRemoteContent: false,
      proxyUrl: () => {
        throw new Error("x");
      },
    });
    expect(boom.html).toContain(DATA_SRC_ATTR);
  });

  it("rewrites table background= like an image", () => {
    const r = sanitizeEmailHtml(`<table background="https://cdn.example.com/bg.png"><tr><td>x</td></tr></table>`);
    expect(r.html).toBe(`<table data-lac-background="https://cdn.example.com/bg.png"><tr><td>x</td></tr></table>`);
    expect(r.blockedCount).toBe(1);
  });

  it("replaces blocked CSS url() with none and records it", () => {
    const r = sanitizeEmailHtml(`<td style="background:#fff url('https://cdn.example.com/bg.png') no-repeat;color:#333">x</td>`);
    expect(r.html).toBe(`<td style="background:#fff none no-repeat;color:#333">x</td>`);
    expect(r.remoteUrls).toEqual(["https://cdn.example.com/bg.png"]);
    expect(r.blockedCount).toBe(1);
  });

  it("passes CSS url() through the proxy when allowed", () => {
    const r = sanitizeEmailHtml(`<div style="background-image:url(https://c.example/b.png)">x</div>`, {
      blockRemoteContent: false,
      proxyUrl: (u) => "https://proxy.example/?u=" + encodeURIComponent(u),
    });
    expect(r.html).toBe(`<div style="background-image:url(&quot;https://proxy.example/?u=https%3A%2F%2Fc.example%2Fb.png&quot;)">x</div>`);
  });
});

describe("tracking pixels", () => {
  it("removes 1x1 images and lists them", () => {
    const r = sanitizeEmailHtml(`<p>Hi</p><img src="https://news.example.com/x/abc123.gif" width="1" height="1" border="0">`);
    expect(r.html).toBe("<p>Hi</p>");
    expect(r.trackers).toEqual(["https://news.example.com/x/abc123.gif"]);
    expect(r.blockedCount).toBe(0);
    expect(r.hasRemoteContent).toBe(false);
  });

  it("removes hidden images (display:none, 1px styles)", () => {
    expect(sanitizeEmailHtml(`<img src="https://a.example/i.png" style="display:none">`).trackers).toHaveLength(1);
    expect(sanitizeEmailHtml(`<img src="https://a.example/i.png" style="width:1px;height:1px">`).trackers).toHaveLength(1);
    expect(sanitizeEmailHtml(`<img src="https://a.example/i.png" style="visibility:hidden">`).trackers).toHaveLength(1);
  });

  it("removes known tracker hosts and paths even at normal size and even when remote content is allowed", () => {
    for (const u of [
      "https://mailtrack.io/trace/mail/abc.png",
      "https://us1.list-manage.com/track/open.php?u=1&id=2",
      "https://u123.ct.sendgrid.net/wf/open?upn=xyz",
      "https://email.example.com/o.gif?id=9",
      "https://email.example.com/e/o/abc",
      "https://news.example.com/pixel/123.png",
      "https://news.example.com/img.png?utm_source=a&utm_medium=b&utm_campaign=c",
    ]) {
      const r = sanitizeEmailHtml(`<img src="${u}" width="600" height="200">`, { blockRemoteContent: false });
      expect(r.html, u).toBe("");
      expect(r.trackers, u).toEqual([u]);
    }
  });

  it("supports extra tracker hosts", () => {
    const r = sanitizeEmailHtml(`<img src="https://img.spy.example/a.png" width="300">`, { trackerHosts: ["spy.example"] });
    expect(r.trackers).toHaveLength(1);
  });

  it("does not flag spacer-sized images that are not tiny in both dimensions, nor cid/data pixels", () => {
    expect(sanitizeEmailHtml(`<img src="https://a.example/spacer.gif" width="1" height="20">`).trackers).toEqual([]);
    expect(sanitizeEmailHtml(`<img src="${PNG}" width="1" height="1">`).html).toContain("data:image/png");
  });

  it("isTrackerUrl matches subdomains of tracker hosts only", () => {
    expect(isTrackerUrl("https://abc.r.us-east-1.awstrack.me/I0/x")).toBe(true);
    expect(isTrackerUrl("https://notawstrack.me/x.png")).toBe(false);
    expect(isTrackerUrl("https://cdn.example.com/images/opening-hours.png")).toBe(false);
  });
});

describe("cid and data images", () => {
  it("maps cid: through cidMap (with or without angle brackets)", () => {
    const cidMap = { "image001.png@01D9A1B2.3C4D5E60": "/api/att/1" };
    expect(sanitizeEmailHtml(`<img src="cid:image001.png@01D9A1B2.3C4D5E60">`, { cidMap }).html).toBe(`<img src="/api/att/1">`);
    expect(sanitizeEmailHtml(`<img src="cid:<image001.png@01D9A1B2.3C4D5E60>">`, { cidMap }).html).toBe(`<img src="/api/att/1">`);
    expect(sanitizeEmailHtml(`<img src="CID:image001.png%4001D9A1B2.3C4D5E60">`, { cidMap }).html).toBe(`<img src="/api/att/1">`);
  });

  it("uses the placeholder for unknown cids and never counts them as remote", () => {
    const r = sanitizeEmailHtml(`<img src="cid:missing">`, { placeholderSrc: "/blank.gif" });
    expect(r.html).toBe(`<img src="/blank.gif">`);
    expect(r.hasRemoteContent).toBe(false);
  });

  it("refuses cidMap values with script schemes", () => {
    expect(sanitizeEmailHtml(`<img src="cid:a">`, { cidMap: { a: "javascript:alert(1)" } }).html).not.toMatch(/javascript/i);
  });

  it("keeps base64 raster data images and enforces the size cap", () => {
    expect(sanitizeEmailHtml(`<img src="${PNG}">`).html).toBe(`<img src="${PNG}">`);
    expect(sanitizeEmailHtml(`<img src="${PNG}">`, { maxDataUriBytes: 20 }).html).toBe(`<img src="${PLACEHOLDER_GIF}">`);
    expect(sanitizeEmailHtml(`<img src="${PNG}">`, { allowDataImages: false }).html).toBe(`<img src="${PLACEHOLDER_GIF}">`);
    expect(sanitizeEmailHtml(`<img src="data:image/png,notbase64">`).html).toBe(`<img src="${PLACEHOLDER_GIF}">`);
  });
});

describe("scoped CSS", () => {
  it("prefixes every selector and maps html/body/:root to the scope", () => {
    const r = sanitizeEmailHtml(`<style>body{margin:0} html body .wrap, #main > p {color:#333} :root{color:red} td.cell a:hover{color:blue}</style>`);
    expect(r.html).toBe(
      "<style>.mail-body{margin:0}\n.mail-body .m-wrap, .mail-body #m-main > p{color:#333}\n.mail-body{color:red}\n.mail-body td.m-cell a:hover{color:blue}</style>",
    );
  });

  it("recurses into @media and keeps !important", () => {
    const out = sanitizeEmailHtml(`<style>@media only screen and (max-width: 600px) { .col { width: 100% !important; } body { padding: 0 } }</style>`, { scope: "#reader" }).html;
    expect(out).toBe("<style>@media only screen and (max-width: 600px){#reader .m-col{width:100% !important}\n#reader{padding:0}}</style>");
  });

  it("drops @import/@charset/@namespace/@font-face (blocking) and keeps prefixed @keyframes", () => {
    const css = `@charset "utf-8"; @import url(x.css); @namespace svg url(x); @font-face{font-family:X;src:url(https://f.example/x.woff)} @keyframes pulse{from{opacity:0}to{opacity:1}} .b{animation:pulse 1s infinite}`;
    const out = sanitizeEmailHtml(`<style>${css}</style>`).html;
    expect(out).toBe("<style>@keyframes m-pulse{from{opacity:0}to{opacity:1}}\n.mail-body .m-b{animation:m-pulse 1s infinite}</style>");
  });

  it("keeps @font-face with proxied src when remote content is allowed", () => {
    const out = sanitizeEmailHtml(`<style>@font-face{font-family:X;src:url(https://f.example/x.woff) format("woff")}</style>`, {
      blockRemoteContent: false,
      proxyUrl: (u) => "/p?u=" + encodeURIComponent(u),
    }).html;
    expect(out).toBe('<style>@font-face{font-family:X;src:url("/p?u=https%3A%2F%2Ff.example%2Fx.woff") format("woff")}</style>');
  });

  it("hoists all style blocks to the top and drops comments inside CSS", () => {
    const out = sanitizeEmailHtml(`<p>a</p><style>/* hi */ p{color:red}</style><p>b</p><style><!-- .x{color:blue} --></style>`).html;
    expect(out).toBe("<style>.mail-body p{color:red}\n.mail-body .m-x{color:blue}</style><p>a</p><p>b</p>");
  });

  it("sanitizes inline style declarations", () => {
    expect(sanitizeEmailHtml(`<p style="color: red; font-family: 'Segoe UI', Arial; garbage; x:;">x</p>`).html).toBe(
      `<p style="color:red;font-family:&#39;Segoe UI&#39;, Arial">x</p>`,
    );
  });
});

describe("links", () => {
  it("adds rel and target and collects links with text", () => {
    const r = sanitizeEmailHtml(`<a href="https://shop.example/sale?utm_source=mail">Shop <b>now</b></a> <a href="mailto:hi@example.com">mail</a>`);
    expect(r.html).toBe(
      `<a href="https://shop.example/sale?utm_source=mail" rel="noopener noreferrer nofollow" target="_blank">Shop <b>now</b></a> <a href="mailto:hi@example.com" rel="noopener noreferrer nofollow">mail</a>`,
    );
    expect(r.links).toEqual([
      { href: "https://shop.example/sale?utm_source=mail", text: "Shop now" },
      { href: "mailto:hi@example.com", text: "mail" },
    ]);
  });

  it("honours linkTarget and upgrades protocol-relative links", () => {
    expect(sanitizeEmailHtml(`<a href="//x.example/a">x</a>`, { linkTarget: "" }).html).toBe(
      `<a href="https://x.example/a" rel="noopener noreferrer nofollow">x</a>`,
    );
    expect(sanitizeEmailHtml(`<a href="tel:+9771234567">call</a>`).links[0]!.href).toBe("tel:+9771234567");
  });

  it("overrides a sender-supplied target and rel", () => {
    const out = sanitizeEmailHtml(`<a href="https://x.example" target="_top" rel="opener">x</a>`).html;
    expect(out).not.toContain("_top");
    expect(out).not.toMatch(/rel="opener"/);
  });
});

describe("structure and limits", () => {
  it("closes unclosed tags and applies implied end tags", () => {
    expect(sanitizeEmailHtml(`<div><b>bold <i>both`).html).toBe("<div><b>bold <i>both</i></b></div>");
    expect(sanitizeEmailHtml(`<p>one<p>two`).html).toBe("<p>one</p><p>two</p>");
    expect(sanitizeEmailHtml(`<ul><li>a<li>b</ul>`).html).toBe("<ul><li>a</li><li>b</li></ul>");
    expect(sanitizeEmailHtml(`<table><tr><td>a<td>b<tr><td>c</table>`).html).toBe(
      "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>",
    );
  });

  it("ignores stray end tags", () => {
    expect(sanitizeEmailHtml(`a</div></span>b</p>`).html).toBe("ab");
  });

  it("maps body to a div carrying its colours", () => {
    expect(sanitizeEmailHtml(`<html><body bgcolor="#f4f4f4" style="margin:0">x</body></html>`).html).toBe(
      `<div bgcolor="#f4f4f4" style="margin:0">x</div>`,
    );
  });

  it("flattens nesting deeper than maxDepth", () => {
    const deep = "<div>".repeat(500) + "x" + "</div>".repeat(500);
    const out = sanitizeEmailHtml(deep, { maxDepth: 10 }).html;
    expect(out).toBe("<div>".repeat(10) + "x" + "</div>".repeat(10));
  });

  it("truncates input at maxLength", () => {
    expect(sanitizeEmailHtml(`<p>hello world</p>`, { maxLength: 8 }).html).toBe("<p>hello</p>");
  });

  it("counts removed tags and comments", () => {
    const r = sanitizeEmailHtml(`<!-- c --><script>x</script><script>y</script><iframe></iframe><p>ok</p>`);
    expect(r.removedTags).toEqual({ "#comment": 1, script: 2, iframe: 1 });
  });

  it("validates presentational attributes", () => {
    const out = sanitizeEmailHtml(`<td width="50%" height="x" bgcolor="#ffcc00" align="center" valign="top" colspan="2" border="a">x</td>`).html;
    expect(out).toBe(`<td width="50%" bgcolor="#ffcc00" align="center" valign="top" colspan="2">x</td>`);
  });

  it("runs in linear time on adversarial input", () => {
    const inputs = [
      "<a ".repeat(50_000),
      "<!--".repeat(50_000),
      "<!-- x -->".repeat(50_000),
      "<div>".repeat(100_000),
      "<b>" + "<i>".repeat(50_000) + "</b>".repeat(50_000),
      '<p title="' + "x".repeat(200_000),
      "<style>" + "a{".repeat(50_000) + "</style>",
      "<style>" + "a{b:c}".repeat(50_000) + "</style>",
      '<div style="' + "a:b;".repeat(50_000) + '">',
      "</".repeat(100_000),
      "&#".repeat(100_000) + "&amp".repeat(50_000),
      "<script>" + "</scrip".repeat(50_000),
    ];
    for (const h of inputs) {
      const t = Date.now();
      sanitizeEmailHtml(h);
      htmlToText(h);
      expect(Date.now() - t, h.slice(0, 20)).toBeLessThan(1500);
    }
  });
});

describe("real-world newsletter", () => {
  const NEWSLETTER = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>October update</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style type="text/css">
  body { margin:0; padding:0; background:#f4f4f4; }
  .container { width:600px; }
  @media only screen and (max-width:620px) { .container { width:100% !important; } }
</style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4f4">
  <tr>
    <td align="center" style="padding:20px 0;">
      <table class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;">
        <tr><td style="padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#333333;">
          <h1 style="margin:0 0 12px;font-size:24px;">Hello Asha,</h1>
          <p style="margin:0 0 12px;">Here is what is new this month &mdash; three features &amp; a fix.</p>
          <img src="cid:logo@acme" width="120" height="40" alt="Acme" style="display:block;border:0;">
          <!--[if mso]><v:roundrect href="https://acme.example/go" style="height:40px;v-text-anchor:middle;width:200px;" arcsize="10%" fillcolor="#1a73e8"><center>Read more</center></v:roundrect><![endif]-->
          <![if !mso]><a href="https://acme.example/go?utm_source=newsletter" style="display:inline-block;background:#1a73e8;color:#ffffff;padding:10px 20px;border-radius:4px;text-decoration:none;">Read more</a><![endif]>
          <font face="Georgia" size="2" color="#999999">You are receiving this because you signed up.</font>
        </td></tr>
      </table>
    </td>
  </tr>
</table>
<img src="https://acme.list-manage.com/track/open.php?u=abc&id=def" height="1" width="1" alt="">
</body>
</html>`;

  const r = sanitizeEmailHtml(NEWSLETTER, { cidMap: { "logo@acme": "/att/logo" } });

  it("keeps the layout", () => {
    expect(r.html).toContain('<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4f4">');
    expect(r.html).toContain('<table class="m-container" width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px">');
    expect(r.html).toContain('<h1 style="margin:0 0 12px;font-size:24px">Hello Asha,</h1>');
    expect(r.html).toContain("Here is what is new this month — three features &amp; a fix.");
    expect(r.html).toContain('<img src="/att/logo" width="120" height="40" alt="Acme" style="display:block;border:0">');
    expect(r.html).toContain('<font face="Georgia" size="2" color="#999999">');
    expect(r.html).toMatch(/<a href="https:\/\/acme\.example\/go\?utm_source=newsletter" rel="noopener noreferrer nofollow" target="_blank" style="display:inline-block;[^"]*">Read more<\/a>/);
  });

  it("scopes the head styles", () => {
    expect(r.html.startsWith("<style>.mail-body{margin:0;padding:0;background:#f4f4f4}\n.mail-body .m-container{width:600px}\n@media only screen and (max-width:620px){.mail-body .m-container{width:100% !important}}</style>")).toBe(true);
  });

  it("drops the Outlook-only block, the title, metas and the tracker", () => {
    expect(r.html).not.toContain("October update");
    expect(r.html).not.toMatch(/roundrect|<meta|<title|PixelsPerInch/i);
    expect(r.trackers).toEqual(["https://acme.list-manage.com/track/open.php?u=abc&id=def"]);
    expect(r.links).toEqual([{ href: "https://acme.example/go?utm_source=newsletter", text: "Read more" }]);
    expect(r.hasRemoteContent).toBe(false);
  });

  it("yields a clean text version", () => {
    expect(htmlToText(NEWSLETTER)).toBe(
      "Hello Asha,\n\nHere is what is new this month — three features & a fix.\n\nRead more (https://acme.example/go?utm_source=newsletter) You are receiving this because you signed up.",
    );
  });
});

describe("htmlToText", () => {
  it("drops head, style and script and turns blocks into lines", () => {
    expect(htmlToText(`<head><title>T</title><style>p{}</style></head><script>x()</script><div>a</div><div>b<br>c</div>`)).toBe("a\nb\nc");
  });
  it("renders lists with dashes", () => {
    expect(htmlToText(`<p>Items:</p><ul><li>one</li><li>two</li></ul>`)).toBe("Items:\n\n- one\n- two");
  });
  it("adds URLs only when the link text differs", () => {
    expect(htmlToText(`<a href="https://x.example/">x.example</a> <a href="https://y.example/p">Docs</a>`)).toBe("x.example Docs (https://y.example/p)");
    expect(htmlToText(`<a href="mailto:a@b.co">a@b.co</a>`)).toBe("a@b.co");
    expect(htmlToText(`<a href="https://y.example">Docs</a>`, { linkStyle: "none" })).toBe("Docs");
    expect(htmlToText(`<a href="javascript:alert(1)">Click</a>`)).toBe("Click");
  });
  it("decodes entities and collapses whitespace", () => {
    expect(htmlToText(`<p>  Tom&nbsp;&amp;\n\n  Jerry &#x1F600; &lt;3  </p>`)).toBe("Tom & Jerry 😀 <3");
  });
  it("truncates at maxLength", () => {
    expect(htmlToText(`<p>abcdefghij</p>`, { maxLength: 5 })).toBe("abcd…");
  });
});

describe("textToHtml", () => {
  it("escapes and keeps newlines", () => {
    expect(textToHtml(`<script>alert(1)</script>\nline 2`)).toBe("&lt;script&gt;alert(1)&lt;/script&gt;<br>line 2");
  });
  it("linkifies URLs, trimming trailing punctuation and unbalanced parens", () => {
    expect(textToHtml(`See https://x.example/a.`)).toBe(
      'See <a href="https://x.example/a" rel="noopener noreferrer nofollow" target="_blank">https://x.example/a</a>.',
    );
    expect(textToHtml(`(see https://en.wikipedia.org/wiki/Foo_(bar))`)).toBe(
      '(see <a href="https://en.wikipedia.org/wiki/Foo_(bar)" rel="noopener noreferrer nofollow" target="_blank">https://en.wikipedia.org/wiki/Foo_(bar)</a>)',
    );
    expect(textToHtml(`go to www.example.com, now`)).toBe(
      'go to <a href="https://www.example.com" rel="noopener noreferrer nofollow" target="_blank">www.example.com</a>, now',
    );
  });
  it("linkifies emails and mailto", () => {
    expect(textToHtml(`Mail <asha@example.com>!`)).toBe(
      'Mail &lt;<a href="mailto:asha@example.com" rel="noopener noreferrer nofollow" target="_blank">asha@example.com</a>&gt;!',
    );
    expect(textToHtml(`mailto:a@b.co`, { linkTarget: "" })).toBe('<a href="mailto:a@b.co" rel="noopener noreferrer nofollow">mailto:a@b.co</a>');
  });
  it("never linkifies script schemes and escapes URL quotes", () => {
    const out = textToHtml(`javascript:alert(1) https://x.example/"onmouseover="alert(1)`);
    expect(out).not.toMatch(/href="javascript/i);
    expect(out).not.toMatch(/<[^>]*\sonmouseover=/i);
  });
  it("groups quoted lines into nested blockquotes", () => {
    expect(textToHtml(`Hi\n> quoted 1\n> quoted 2\n>> older\nBye`)).toBe(
      "Hi<blockquote>quoted 1<br>quoted 2<blockquote>older</blockquote></blockquote>Bye",
    );
  });
  it("can turn linkify off", () => {
    expect(textToHtml(`https://x.example`, { linkify: false })).toBe("https://x.example");
  });
});

describe("snippet", () => {
  it("previews HTML and text, cut at a word boundary", () => {
    expect(snippet(`<style>p{}</style><p>Hello <b>there</b></p><p>friend</p>`)).toBe("Hello there friend");
    expect(snippet("The quick brown fox jumps over the lazy dog", 20)).toBe("The quick brown fox…");
    expect(snippet("short")).toBe("short");
  });
});
