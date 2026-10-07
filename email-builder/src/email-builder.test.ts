import { describe, expect, it } from "vitest";
import {
  blockSchema,
  contrastRatio,
  defaultBrand,
  escapeAttr,
  escapeHtml,
  isSafeUrl,
  render,
  sanitizeRichText,
  starterTemplates,
  validate,
} from "./index";
import type { Block, Brand, EmailDoc } from "./index";

const doc = (blocks: Block[], extra: Partial<EmailDoc> = {}): EmailDoc => ({
  blocks,
  brand: defaultBrand,
  preheader: "Preview text",
  ...extra,
});
const text = (id: string, content: string, props: Record<string, unknown> = {}): Block => ({
  id,
  type: "text",
  props: { content, ...props },
});
const LONG = "This is a long paragraph of body text. ".repeat(10);
const errorsOf = (d: unknown) => validate(d).errors.map((e) => e.message).join(" | ");

describe("document shell", () => {
  const { html } = render(doc([text("t", "Hello")]));

  it("has a doctype, charset, viewport and apple reformatting meta", () => {
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('name="viewport"');
    expect(html).toContain('<meta name="x-apple-disable-message-reformatting">');
  });

  it("includes the Office PixelsPerInch XML inside an MSO conditional", () => {
    expect(html).toMatch(/<!--\[if mso\]><noscript><xml><o:OfficeDocumentSettings>.*<o:PixelsPerInch>96<\/o:PixelsPerInch>.*<\/xml><\/noscript><!\[endif\]-->/);
  });

  it("wraps content in a fixed-width MSO table", () => {
    expect(html).toContain('<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" align="center"><tr><td><![endif]-->');
    expect(html).toContain("<!--[if mso]></td></tr></table><![endif]-->");
    expect(html).toContain("max-width:600px");
  });

  it("honours a custom width", () => {
    const r = render(doc([text("t", "Hi")], { width: 640 }));
    expect(r.html).toContain('width="640" align="center"');
    expect(r.html).toContain("max-width:640px");
  });

  it("keeps critical styles inline and the style block small", () => {
    expect(html).toMatch(/<div class="lac-text" style="font-family:Arial, Helvetica, sans-serif;font-size:16px/);
    const style = /<style[^>]*>([\s\S]*?)<\/style>/.exec(html)![1]!;
    expect(style).toContain("@media only screen and (max-width:600px)");
    expect(style.length).toBeLessThan(2500);
  });

  it("uses the brand font when provided", () => {
    const brand: Brand = { ...defaultBrand, font: { family: "Open Sans", fallback: "Arial, sans-serif" } };
    expect(render({ ...doc([text("t", "x")]), brand }).html).toContain("font-family:'Open Sans', Arial, sans-serif");
  });
});

describe("preheader", () => {
  it("renders a hidden span followed by &zwnj;&nbsp; padding", () => {
    const { html } = render(doc([text("t", "Body")], { preheader: "Sneak peek" }));
    expect(html).toMatch(/<span class="lac-preheader" style="display:none;[^"]*mso-hide:all;[^"]*">Sneak peek<\/span><span style="display:none;[^"]*">(&zwnj;&nbsp;)+<\/span>/);
  });

  it("warns when the preheader is missing", () => {
    const r = render({ blocks: [text("t", LONG)], brand: defaultBrand });
    expect(r.html).not.toContain("lac-preheader");
    expect(r.warnings.some((w) => /preheader/i.test(w))).toBe(true);
  });
});

describe("button", () => {
  const btn = (props: Record<string, unknown>) => render(doc([{ id: "b", type: "button", props: { text: "Go", url: "https://x.test/a?b=1&c=2", ...props } }]));

  it("renders a VML roundrect for Outlook plus an <a> fallback", () => {
    const { html } = btn({});
    expect(html).toMatch(/<!--\[if mso\]><v:roundrect [^>]*href="https:\/\/x\.test\/a\?b=1&amp;c=2"[^>]*fillcolor="#2563eb"[^>]*>.*<\/v:roundrect><!\[endif\]-->/);
    expect(html).toContain('<!--[if !mso]><!--><a href="https://x.test/a?b=1&amp;c=2"');
    expect(html).toContain("<!--<![endif]-->");
  });

  it("follows brand.radius in arcsize and border-radius", () => {
    const brand: Brand = { ...defaultBrand, radius: 11 };
    const { html } = render({ ...doc([{ id: "b", type: "button", props: { text: "Go", url: "https://x.test" } }]), brand });
    expect(html).toContain('arcsize="25%"');
    expect(html).toContain("border-radius:11px");
  });

  it("supports colour override, alignment and full width", () => {
    const { html } = btn({ color: "#0f766e", align: "left", fullWidth: true });
    expect(html).toContain('fillcolor="#0f766e"');
    expect(html).toContain('<td align="left"><!--[if mso]>');
    expect(html).toContain("width:552px;");
    expect(html).toContain("display:block;background-color:#0f766e");
  });

  it("converts rgb() colours to hex for VML", () => {
    expect(btn({ color: "rgb(15, 118, 110)" }).html).toContain('fillcolor="#0f766e"');
  });

  it("drops an unsafe URL with a warning", () => {
    const r = btn({ url: "javascript:alert(1)" });
    expect(r.html).not.toContain("javascript:");
    expect(r.warnings.some((w) => /dropped/.test(w))).toBe(true);
  });
});

describe("image", () => {
  it("always sets width and the display:block style", () => {
    const { html } = render(doc([text("t", LONG), { id: "i", type: "image", props: { src: "https://cdn.test/a.png", alt: "A chart" } }]));
    expect(html).toContain('<img src="https://cdn.test/a.png" width="552" alt="A chart" style="display:block;max-width:100%;height:auto;border:0">');
  });

  it("clamps width to the content width and supports a link", () => {
    const { html } = render(
      doc([text("t", LONG), { id: "i", type: "image", props: { src: "https://cdn.test/a.png", alt: "A", width: 9999, href: "https://x.test" } }]),
    );
    expect(html).toContain('width="552"');
    expect(html).toMatch(/<a href="https:\/\/x\.test" target="_blank"[^>]*><img /);
  });

  it("decorative images get an empty alt without a warning", () => {
    const r = render(doc([text("t", LONG), { id: "i", type: "image", props: { src: "https://cdn.test/a.png", decorative: true } }]));
    expect(r.html).toContain('alt=""');
    expect(r.warnings.filter((w) => /alt/.test(w))).toEqual([]);
  });

  it("warns about many images with little text", () => {
    const imgs: Block[] = [1, 2, 3].map((n) => ({ id: `i${n}`, type: "image", props: { src: `https://cdn.test/${n}.png`, alt: `Photo ${n}` } }));
    const r = render(doc([text("t", "Hi"), ...imgs]));
    expect(r.warnings.some((w) => /Image-heavy/.test(w))).toBe(true);
  });
});

describe("columns", () => {
  const cols = (props: Record<string, unknown> = {}, n = 2): Block => ({
    id: "c",
    type: "columns",
    props,
    children: Array.from({ length: n }, (_, i) => ({
      id: `k${i}`,
      type: "text" as const,
      props: { content: `Column ${i}` },
      children: [{ id: `k${i}-b`, type: "button" as const, props: { text: `Btn ${i}`, url: "https://x.test" } }],
    })),
  });

  it("uses MSO ghost tables and inline-block divs", () => {
    const { html } = render(doc([cols()]));
    expect(html).toContain('<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="552"><tr><![endif]-->');
    expect(html).toContain('<!--[if mso]><td width="276" valign="top"><![endif]-->');
    expect(html).toContain('<div class="lac-stack" style="display:inline-block;vertical-align:top;width:100%;max-width:276px;">');
    expect(html).toContain("<!--[if mso]></tr></table><![endif]-->");
  });

  it("applies ratios (array or string)", () => {
    expect(render(doc([cols({ ratios: [1, 2] })])).html).toContain('<td width="184" valign="top">');
    expect(render(doc([cols({ ratios: "1,2" })])).html).toContain('<td width="368" valign="top">');
  });

  it("renders a child's own children stacked inside its column", () => {
    const { html } = render(doc([cols()]));
    const col0 = html.indexOf("Column 0");
    const btn0 = html.indexOf("Btn 0");
    const col1 = html.indexOf("Column 1");
    expect(col0).toBeGreaterThan(0);
    expect(btn0).toBeGreaterThan(col0);
    expect(col1).toBeGreaterThan(btn0);
  });

  it("stackOnMobile:false keeps columns side by side (percent widths, no stack class)", () => {
    const { html } = render(doc([cols({ stackOnMobile: false })]));
    expect(html).not.toContain('class="lac-stack"');
    expect(html).toContain("width:50%;max-width:276px;");
  });

  it("the media query stacks columns at 600px", () => {
    expect(render(doc([cols()])).html).toMatch(/@media only screen and \(max-width:600px\)\{[^}]*\}\.lac-stack\{display:block!important;width:100%!important/);
  });

  it("renders at most 4 columns with a warning", () => {
    const r = render(doc([cols({}, 5)]));
    expect(r.html).not.toContain("Column 4");
    expect(r.warnings.some((w) => /first 4/.test(w))).toBe(true);
  });
});

describe("{{vars}} pass through", () => {
  it("keeps simple, conditional and fallback vars untouched in text", () => {
    const { html } = render(doc([text("t", "Hi {{firstName|there}} {{#if paid}}Thanks & bye{{/if}} {{amount}}")]));
    expect(html).toContain("Hi {{firstName|there}} {{#if paid}}Thanks &amp; bye{{/if}} {{amount}}");
  });

  it("keeps vars verbatim in href without percent-encoding", () => {
    const { html } = render(doc([{ id: "b", type: "button", props: { text: "Pay", url: "https://pay.test/i/{{invoiceId}}?u={{userId}}" } }]));
    expect(html).toContain('href="https://pay.test/i/{{invoiceId}}?u={{userId}}"');
    expect(html).not.toContain("%7B");
  });

  it("accepts a bare {{var}} URL and keeps it in rich-text links", () => {
    const { html } = render(doc([text("t", 'See <a href="{{helpUrl}}">help</a>')]));
    expect(html).toContain('<a href="{{helpUrl}}" target="_blank"');
  });

  it("defaults the footer unsubscribe link to {{unsubscribeUrl}}", () => {
    expect(render(doc([{ id: "f", type: "footer", props: {} }])).html).toContain('href="{{unsubscribeUrl}}"');
  });

  it("escapes a quote inside a var used in an attribute", () => {
    expect(escapeAttr('{{a|"x"}}')).toBe("{{a|&quot;x&quot;}}");
  });

  it("does not treat braces containing angle brackets as a var", () => {
    expect(escapeHtml("{{<script>}}")).toBe("{{&lt;script&gt;}}");
  });
});

describe("escaping and sanitizer", () => {
  it("escapes plain user text in props", () => {
    const { html } = render(doc([{ id: "b", type: "button", props: { text: '<b>"Buy" & go</b>', url: "https://x.test" } }]));
    expect(html).toContain("&lt;b&gt;&quot;Buy&quot; &amp; go&lt;/b&gt;");
  });

  it("escapes brand name in header and title", () => {
    const brand: Brand = { ...defaultBrand, name: "A&B <Co>" };
    const { html } = render({ ...doc([{ id: "h", type: "header", props: {} }]), brand });
    expect(html).toContain("<title>A&amp;B &lt;Co&gt;</title>");
    expect(html).toContain(">A&amp;B &lt;Co&gt;</span>");
  });

  it("keeps the allowed inline subset", () => {
    const out = sanitizeRichText('<p><b>B</b><strong>S</strong><i>I</i><em>E</em><u>U</u><br><ul><li>x</li></ul><ol><li>y</li></ol></p>');
    for (const t of ["<b>B</b>", "<strong>S</strong>", "<i>I</i>", "<em>E</em>", "<u>U</u>", "<br>", "<ul ", "<ol ", "<li "]) expect(out).toContain(t);
  });

  it("strips scripts, styles, iframes and their contents", () => {
    const out = sanitizeRichText('a<script>alert(1)</script>b<style>p{}</style>c<iframe src="x">z</iframe>d');
    expect(out).toBe("abcd");
  });

  it("strips event handlers and disallowed attributes", () => {
    const out = sanitizeRichText('<b onclick="x()" class="k">t</b><img src=x onerror=alert(1)>');
    expect(out).toBe("<b>t</b>");
  });

  it("removes javascript: and data: hrefs but keeps the text", () => {
    expect(sanitizeRichText('<a href="javascript:alert(1)">x</a>')).toBe("x");
    expect(sanitizeRichText('<a href=" JaVaScRiPt:alert(1)">x</a>')).toBe("x");
    expect(sanitizeRichText('<a href="&#106;avascript:alert(1)">x</a>')).toBe("x");
    expect(sanitizeRichText('<a href="data:text/html,hi">x</a>')).toBe("x");
  });

  it("keeps http(s), mailto and tel links", () => {
    expect(sanitizeRichText('<a href="https://x.test/?a=1&amp;b=2">x</a>')).toContain('href="https://x.test/?a=1&amp;b=2"');
    expect(sanitizeRichText('<a href="mailto:a@b.test">m</a>')).toContain('href="mailto:a@b.test"');
    expect(sanitizeRichText('<a href="tel:+9771234">t</a>')).toContain('href="tel:+9771234"');
  });

  it("limits span style to color and font-weight", () => {
    const out = sanitizeRichText('<span style="color:#ff0000;font-weight:bold;background:url(x);position:fixed">s</span>');
    expect(out).toBe('<span style="color:#ff0000;font-weight:bold">s</span>');
    expect(sanitizeRichText('<span style="color:expression(alert(1))">s</span>')).toBe("<span>s</span>");
  });

  it("closes unclosed tags, drops stray closers and comments, escapes stray <", () => {
    expect(sanitizeRichText("<b>open")).toBe("<b>open</b>");
    expect(sanitizeRichText("x</b>y<!-- c -->z")).toBe("xyz");
    expect(sanitizeRichText("1 < 2 && 3 > 2")).toBe("1 &lt; 2 &amp;&amp; 3 &gt; 2");
  });

  it("passes the html block through raw with a warning", () => {
    const r = render(doc([text("t", LONG), { id: "h", type: "html", props: { html: '<div class="custom">raw</div>' } }]));
    expect(r.html).toContain('<div class="custom">raw</div>');
    expect(r.warnings.some((w) => /raw HTML/.test(w))).toBe(true);
  });
});

describe("validate", () => {
  const ok = (blocks: Block[]) => validate({ blocks, brand: defaultBrand });

  it("accepts a good document", () => {
    expect(ok([text("t", "Hi"), { id: "b", type: "button", props: { text: "Go", url: "{{ctaUrl}}" } }])).toEqual({ ok: true, errors: [] });
  });

  it("flags unknown block types", () => {
    const r = ok([{ id: "x", type: "video" as Block["type"], props: {} }]);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toEqual({ blockId: "x", message: 'unknown block type "video"' });
  });

  it("flags missing required props", () => {
    expect(errorsOf({ blocks: [{ id: "b", type: "button", props: { text: "Go" } }] })).toContain('missing required prop "url"');
    expect(errorsOf({ blocks: [{ id: "t", type: "text", props: {} }] })).toContain('missing required prop "content"');
  });

  it("flags bad colour strings in props and brand", () => {
    expect(errorsOf({ blocks: [text("t", "x", { color: "reddish" })] })).toContain("color is not a valid colour");
    const r = validate({ blocks: [], brand: { ...defaultBrand, colors: { ...defaultBrand.colors, primary: "#12" } } });
    expect(r.errors).toContainEqual({ blockId: "brand", message: "brand.colors.primary is not a valid colour (#12)" });
  });

  it("flags URLs that aren't http(s)/mailto/tel/{{var}}", () => {
    expect(errorsOf({ blocks: [{ id: "b", type: "button", props: { text: "Go", url: "javascript:alert(1)" } }] })).toContain("url must be");
    expect(errorsOf({ blocks: [{ id: "b", type: "button", props: { text: "Go", url: "ftp://x.test" } }] })).toContain("url must be");
    expect(ok([{ id: "b", type: "button", props: { text: "Go", url: "mailto:a@b.test" } }]).ok).toBe(true);
    expect(ok([{ id: "b", type: "button", props: { text: "Go", url: "tel:+977-1-555" } }]).ok).toBe(true);
    expect(ok([{ id: "b", type: "button", props: { text: "Go", url: "https://x.test/{{id}}" } }]).ok).toBe(true);
  });

  it("flags duplicate ids, including nested ones", () => {
    const r = ok([text("a", "x"), { id: "c", type: "columns", props: {}, children: [text("a", "y")] }]);
    expect(r.errors).toContainEqual({ blockId: "a", message: 'duplicate block id "a"' });
  });

  it("flags images without alt unless decorative", () => {
    expect(errorsOf({ blocks: [{ id: "i", type: "image", props: { src: "https://x.test/a.png" } }] })).toContain("alt text");
    expect(ok([{ id: "i", type: "image", props: { src: "https://x.test/a.png", decorative: true } }]).ok).toBe(true);
  });

  it("flags <script> in an html block", () => {
    expect(errorsOf({ blocks: [{ id: "h", type: "html", props: { html: "<p>x</p>< script>bad()</script>" } }] })).toContain("<script>");
  });

  it("flags columns with 0 or more than 4 children", () => {
    expect(errorsOf({ blocks: [{ id: "c", type: "columns", props: {}, children: [] }] })).toContain("it has 0");
    const five = Array.from({ length: 5 }, (_, i) => text(`k${i}`, "x"));
    expect(errorsOf({ blocks: [{ id: "c", type: "columns", props: {}, children: five }] })).toContain("it has 5");
  });

  it("flags bad select values and non-array blocks", () => {
    expect(errorsOf({ blocks: [text("t", "x", { align: "middle" })] })).toContain("align must be one of");
    expect(validate({}).errors).toContainEqual({ blockId: "", message: "doc.blocks must be an array" });
  });
});

describe("contrast", () => {
  it("computes WCAG ratios", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#fff", "#fff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#777777", "#ffffff")!).toBeCloseTo(4.48, 2);
    expect(contrastRatio("nope", "#fff")).toBeNull();
  });

  it("warns when body text is below 4.5:1 on surface or background", () => {
    const brand: Brand = { ...defaultBrand, colors: { ...defaultBrand.colors, text: "#999999" } };
    const r = render({ ...doc([text("t", LONG)]), brand });
    expect(r.warnings.filter((w) => /Low contrast: body text/.test(w)).length).toBe(2);
  });

  it("warns when button text is below 3:1 on the button colour", () => {
    const r = render(doc([{ id: "b", type: "button", props: { text: "Go", url: "https://x.test", color: "#ffeb3b" } }]));
    expect(r.warnings.some((w) => /Low contrast: button text/.test(w))).toBe(true);
  });

  it("does not warn for the default brand", () => {
    const r = render(doc([text("t", LONG), { id: "b", type: "button", props: { text: "Go", url: "https://x.test" } }]));
    expect(r.warnings).toEqual([]);
  });
});

describe("plain text output", () => {
  const blocks: Block[] = [
    { id: "h", type: "header", props: {} },
    text("t1", "Big news for {{firstName}}", { variant: "h1" }),
    text("t2", 'Read <a href="https://x.test/post">the post</a> or <a href="https://x.test">https://x.test</a>.'),
    { id: "l", type: "list", props: { items: ["One", "Two"] } },
    { id: "b", type: "button", props: { text: "Pay now", url: "{{payUrl}}" } },
    { id: "i", type: "image", props: { src: "https://x.test/a.png", alt: "Team photo" } },
    { id: "q", type: "quote", props: { content: "Great service", cite: "A customer" } },
    { id: "tb", type: "table", props: { rows: "A | B\n1 | {{x|y}}" } },
    { id: "f", type: "footer", props: {} },
  ];
  const { text: t } = render(doc(blocks));

  it("uppercases headings but keeps {{vars}}", () => {
    expect(t).toContain("BIG NEWS FOR {{firstName}}");
  });
  it("writes links as text (url)", () => {
    expect(t).toContain("Read the post (https://x.test/post) or https://x.test.");
  });
  it("writes lists with '- ' and buttons as 'Text: url'", () => {
    expect(t).toContain("- One\n- Two");
    expect(t).toContain("Pay now: {{payUrl}}");
  });
  it("writes images by alt, quotes, tables and the footer", () => {
    expect(t).toContain("Team photo");
    expect(t).toContain("> Great service\n— A customer");
    expect(t).toContain("A | B\n1 | {{x|y}}");
    expect(t).toContain("Unsubscribe: {{unsubscribeUrl}}");
    expect(t).toContain("Your Company · {{companyAddress}}");
  });
});

describe("other blocks", () => {
  it("header shows the logo when present, else the brand name", () => {
    const withLogo = render({ ...doc([{ id: "h", type: "header", props: { logoWidth: 120 } }]), brand: { ...defaultBrand, logoUrl: "https://x.test/logo.png" } });
    expect(withLogo.html).toContain('<img src="https://x.test/logo.png" width="120" alt="Your Company"');
    expect(render(doc([{ id: "h", type: "header", props: {} }])).html).toContain(">Your Company</span>");
  });

  it("footer renders address, note and socials as text links", () => {
    const brand: Brand = { ...defaultBrand, address: "1 Main St", socials: [{ kind: "linkedin", url: "https://linkedin.test/co" }] };
    const { html } = render({ ...doc([{ id: "f", type: "footer", props: { note: "Why you get this" } }]), brand });
    expect(html).toContain("Why you get this");
    expect(html).toContain("Your Company &middot; 1 Main St");
    expect(html).toMatch(/<a href="https:\/\/linkedin\.test\/co"[^>]*>LinkedIn<\/a>/);
  });

  it("social block uses labelled links and an optional icon base", () => {
    const brand: Brand = { ...defaultBrand, socials: [{ kind: "x", url: "https://x.test/co" }] };
    const plain = render({ ...doc([{ id: "s", type: "social", props: {} }]), brand }).html;
    expect(plain).toMatch(/>X<\/a>/);
    expect(plain).not.toContain("<img");
    const icons = render({ ...doc([{ id: "s", type: "social", props: { iconBaseUrl: "https://icons.test/set/" } }]), brand }).html;
    expect(icons).toContain('src="https://icons.test/set/x.png"');
  });

  it("list, quote, table, divider and spacer render", () => {
    const { html } = render(
      doc([
        { id: "l", type: "list", props: { items: "a\nb", ordered: true } },
        { id: "q", type: "quote", props: { content: "<i>q</i>", cite: "me" } },
        { id: "t", type: "table", props: { rows: [["H1", "H2"], ["c1", "c2"]], headerRow: true } },
        { id: "d", type: "divider", props: { thickness: 2 } },
        { id: "s", type: "spacer", props: { height: 40 } },
      ]),
    );
    expect(html).toContain(">1.</td>");
    expect(html).toContain("border-left:4px solid #2563eb");
    expect(html).toContain("&mdash; me");
    expect(html).toMatch(/<th [^>]*>H1<\/th>/);
    expect(html).toContain("border-top:2px solid #6b7280");
    expect(html).toContain('height="40" style="height:40px;');
  });

  it("block props override brand colours", () => {
    const { html } = render(doc([text("t", "x", { color: "#111111" })]));
    expect(html).toContain("color:#111111;");
  });
});

describe("dark mode", () => {
  it("auto adds prefers-color-scheme, data-ogsc/ogsb hooks and the color-scheme meta", () => {
    const { html } = render(doc([text("t", "x")]), { darkMode: "auto" });
    expect(html).toContain("@media (prefers-color-scheme:dark)");
    expect(html).toContain("[data-ogsc] .lac-text");
    expect(html).toContain("[data-ogsb] .lac-bg");
    expect(html).toContain('<meta name="color-scheme" content="light dark">');
    expect(html).toContain('<meta name="supported-color-schemes" content="light dark">');
  });

  it("is the default", () => {
    expect(render(doc([text("t", "x")])).html).toContain("prefers-color-scheme:dark");
  });

  it("off removes dark styles and declares light only", () => {
    const { html } = render(doc([text("t", "x")]), { darkMode: "off" });
    expect(html).not.toContain("prefers-color-scheme");
    expect(html).not.toContain("data-ogsc");
    expect(html).toContain('<meta name="color-scheme" content="light">');
  });

  it("never inverts the logo", () => {
    const { html } = render({ ...doc([{ id: "h", type: "header", props: {} }]), brand: { ...defaultBrand, logoUrl: "https://x.test/l.png" } });
    expect(html).not.toMatch(/invert/i);
    expect(html).toMatch(/<img src="https:\/\/x\.test\/l\.png"(?![^>]*class=)[^>]*>/);
  });
});

describe("size and unicode", () => {
  it("reports UTF-8 byte size", () => {
    const r = render(doc([text("t", "नमस्ते")]));
    expect(r.size).toBe(new TextEncoder().encode(r.html).length);
    expect(r.size).toBeGreaterThan(r.html.length);
  });

  it("warns above 90KB", () => {
    const big = Array.from({ length: 300 }, (_, i) => text(`t${i}`, LONG));
    const r = render(doc(big));
    expect(r.size).toBeGreaterThan(90 * 1024);
    expect(r.warnings.some((w) => /Gmail clips/.test(w))).toBe(true);
  });

  it("keeps Nepali (Devanagari) text intact in html and text", () => {
    const r = render(doc([text("t", "शुभ दशैं, {{firstName}} ज्यू!", { variant: "h2" }), { id: "b", type: "button", props: { text: "थप पढ्नुहोस्", url: "https://x.test" } }]), {
      darkMode: "off",
    });
    expect(r.html).toContain("शुभ दशैं, {{firstName}} ज्यू!");
    expect(r.html).toContain("थप पढ्नुहोस्</center>");
    expect(r.text).toContain("शुभ दशैं, {{firstName}} ज्यू!");
    expect(r.text).toContain("थप पढ्नुहोस्: https://x.test");
  });
});

describe("blockSchema", () => {
  it("covers all 13 block types with labels", () => {
    const types = ["header", "text", "image", "button", "divider", "spacer", "columns", "social", "footer", "html", "quote", "list", "table"];
    expect(Object.keys(blockSchema).sort()).toEqual([...types].sort());
    for (const t of types) expect(blockSchema[t as Block["type"]].label).toBeTruthy();
    expect(blockSchema.columns.acceptsChildren).toBe(true);
    expect(blockSchema.footer.props.unsubscribeUrl!.default).toBe("{{unsubscribeUrl}}");
  });

  it("isSafeUrl matches the rules", () => {
    expect(isSafeUrl("https://a.test")).toBe(true);
    expect(isSafeUrl("{{url}}")).toBe(true);
    expect(isSafeUrl("//a.test")).toBe(false);
    expect(isSafeUrl("data:image/png;base64,xx")).toBe(false);
  });
});

describe("starter templates", () => {
  it("has at least 9 with the required categories and unique ids", () => {
    expect(starterTemplates.length).toBeGreaterThanOrEqual(9);
    expect(new Set(starterTemplates.map((t) => t.id)).size).toBe(starterTemplates.length);
    for (const c of ["sales", "support", "finance", "newsletter", "onboarding"]) {
      expect(starterTemplates.some((t) => t.category === c)).toBe(true);
    }
    expect(starterTemplates.filter((t) => t.category === "finance").length).toBeGreaterThanOrEqual(2);
    expect(starterTemplates.some((t) => t.id === "festival-greeting" && t.category === "newsletter")).toBe(true);
  });

  for (const t of starterTemplates) {
    it(`${t.id}: has a preheader, validates and renders with zero warnings`, () => {
      expect(t.doc.preheader).toBeTruthy();
      const d = { ...t.doc, brand: defaultBrand };
      expect(validate(d)).toEqual({ ok: true, errors: [] });
      const r = render(d);
      expect(r.warnings).toEqual([]);
      expect(r.size).toBeLessThan(90 * 1024);
    });
  }

  it("images use only {{vars}} (no hotlinks)", () => {
    const walk = (bs: Block[]): Block[] => bs.flatMap((b) => [b, ...walk(b.children ?? [])]);
    for (const t of starterTemplates) {
      for (const b of walk(t.doc.blocks)) if (b.type === "image") expect(String(b.props.src)).toMatch(/^\{\{[^}]+\}\}$/);
    }
  });
});

describe("1.1.0 gallery metadata and labels", () => {
  it("every starter has a subject and description, using only variables its body uses", () => {
    for (const st of starterTemplates) {
      expect(st.subject.length).toBeGreaterThan(5);
      expect(st.description.length).toBeGreaterThan(10);
      const body = JSON.stringify(st.doc);
      for (const m of st.subject.matchAll(/\{\{\s*([a-zA-Z]+)/g)) {
        if (m[1] !== "firstName") expect(body).toContain(`{{${m[1]}`);
      }
    }
  });
  it("every prop in blockSchema has a label", () => {
    for (const spec of Object.values(blockSchema)) for (const p of Object.values(spec.props)) expect(typeof p.label).toBe("string");
  });
});
