# @lacspace/email-builder

Build emails from blocks, not hand-written HTML. You describe an email as a small JSON document (a header, some text, a button, a footer) plus a brand. `render()` turns it into table-based, responsive email HTML that holds up in Outlook desktop, Gmail, Apple Mail and mobile apps, and gives you a plain-text version too.

It powers Templates Studio in Lacspace Mail, but it has no ties to it. Zero dependencies, works in Node 18+ and the browser, and ships as ESM and CJS with types.

```bash
npm i @lacspace/email-builder
```

## Example

```ts
import { render, validate, defaultBrand, type Brand } from "@lacspace/email-builder";

const brand: Brand = {
  ...defaultBrand,
  name: "Acme",
  logoUrl: "https://cdn.acme.test/logo.png",
  colors: { primary: "#0f766e", text: "#1f2937", muted: "#6b7280", background: "#f3f4f6", surface: "#ffffff" },
  address: "1 Main Street, Springfield",
};

const doc = {
  brand,
  preheader: "Your invoice {{invoiceNumber}} is ready",
  blocks: [
    { id: "h", type: "header", props: {} },
    { id: "t", type: "text", props: { variant: "h1", content: "Hi {{firstName|there}}" } },
    { id: "p", type: "text", props: { content: "<p>Your invoice is ready. <b>Thank you</b> for your business.</p>" } },
    { id: "b", type: "button", props: { text: "View invoice", url: "{{invoiceUrl}}" } },
    { id: "f", type: "footer", props: {} },
  ],
} as const;

const check = validate(doc);           // { ok, errors: [{ blockId, message }] }
const { html, text, warnings, size } = render(doc, { darkMode: "auto" });
```

`html` is a full HTML document, `text` is the plain-text alternative, `warnings` lists anything worth fixing before sending, and `size` is the UTF-8 byte length of `html`.

## API

- **`render(doc, opts?)`** returns `{ html, text, warnings, size }`.
  - `doc`: `{ blocks, brand, preheader?, width? }`. `width` defaults to 600 (clamped to 320–1200).
  - `opts.darkMode`: `"auto"` (default) or `"off"`.
  - `opts.inlineCss`: accepted for compatibility. Critical styles are always written inline, so it changes nothing.
  - It never throws on bad input. Problems such as unsafe URLs or invalid colours become warnings and fall back to safe values.
- **`validate(doc)`** returns `{ ok, errors }`. Each error is `{ blockId, message }`; brand problems use `blockId: "brand"`.
- **`blockSchema`**: the props for each block type (`type`, `options`, `default`, `label`, `required`) and `acceptsChildren`. Use it to generate editor forms.
- **`starterTemplates`**: ready-made documents (see below). The brand is applied at render time. Each has `id`, `name`, `category`, a suggested `subject` (1.1.0; only uses {{vars}} the body also uses) and a one-line `description` for a gallery. Every prop in `blockSchema` has a `label`.
- **`defaultBrand`**: a neutral brand for previews.
- **Helpers:** `sanitizeRichText`, `htmlToText`, `escapeHtml`, `escapeAttr`, `isSafeUrl`, `contrastRatio`, `parseColor`, `isColor`, `toHex`, `luminance`, `blockToText`, `docToText`, plus the constants `VAR_RE`, `ALLOWED_TAGS`, `DEFAULT_FONT`, `DEFAULT_WIDTH` and `SIZE_WARN_BYTES`.

## Blocks

Every block is `{ id, type, props, children? }`. Colour props override the brand colour for that block only.

| Type | Props |
| --- | --- |
| `header` | `align` (left/center/right, default left), `logoWidth` (default 140), `background`, `textColor`. Shows `brand.logoUrl`, or `brand.name` as text if there is no logo. |
| `text` | `content` (rich text, required), `variant` (body/h1/h2/h3/small), `align`, `color`, `fontSize`. |
| `image` | `src` (required), `alt` (required unless `decorative: true`), `decorative`, `width` (defaults to the full content width), `href`, `align` (default center). |
| `button` | `text` and `url` (required), `align` (default center), `fullWidth`, `color` (default `brand.colors.primary`), `textColor` (default `#ffffff`). Corners follow `brand.radius`. |
| `divider` | `color` (default `brand.colors.muted`), `thickness` (default 1). |
| `spacer` | `height` (default 24). |
| `columns` | `ratios` (`number[]` or a string like `"1,2"`), `gap` (default 16), `stackOnMobile` (default true). `children` are the columns, 1 to 4. Each child renders in its own column, and that child's own `children` render stacked under it in the same column. |
| `social` | `iconBaseUrl` (optional), `align`. Links come from `props.links` (`[{ kind, url, label? }]`) or else `brand.socials`. Each link is a text label; with `iconBaseUrl` an `<img src="{iconBaseUrl}/{kind}.png">` is added before the label. No icon CDN is used by default. |
| `footer` | `unsubscribeUrl` (default `{{unsubscribeUrl}}`), `unsubscribeText` (default "Unsubscribe"), `note`, `showSocials` (default true), `align`. Shows the brand name, `brand.address` and the brand socials as text links. |
| `html` | `html` (required). Passed through raw, and `render()` always adds a warning for it. |
| `quote` | `content` (rich text, required), `cite`, `borderColor` (default primary). |
| `list` | `items` (`string[]` or one item per line, required), `ordered`. Items accept rich text. |
| `table` | `rows` (`string[][]` or one row per line with cells split by `|`, required), `headerRow` (default true), `striped`. Cells accept rich text. A `|` inside a `{{var|fallback}}` does not split a cell. |

### Rich text

`text`, `quote`, list items and table cells accept a safe inline subset: `b`, `strong`, `i`, `em`, `u`, `a[href]`, `br`, `p`, `ul`, `ol`, `li` and `span[style]` (only `color` and `font-weight`). Everything else is stripped:

- other tags (their text is kept);
- `script`, `style`, `iframe` and similar elements, along with their contents;
- every other attribute, including event handlers;
- comments;
- any `href` that isn't `http(s):`, `mailto:`, `tel:` or a `{{var}}`, which removes `javascript:` and `data:` links, including entity-encoded ones.

Unclosed tags are closed, and stray closing tags are dropped. All other props are plain text and are HTML-escaped.

## The brand object

```ts
type Brand = {
  name: string;
  logoUrl?: string;
  colors: { primary: string; text: string; muted: string; background: string; surface: string };
  font?: { family: string; fallback: string };  // default stack: Arial, Helvetica, sans-serif
  radius?: number;                               // button and card corners, default 6
  address?: string;                              // shown in the footer
  socials?: Array<{ kind: string; url: string }>;
};
```

- `background` is the page behind the email and `surface` is the email card.
- `text` is used for body copy, `muted` for small print and the footer, and `primary` for buttons, links and quote bars.
- Colours can be `#rgb`, `#rrggbb`, `rgb()` or `rgba()`. The alpha in `rgba()` is ignored by the contrast check.

## Starter templates

There are 9 starters, each with a preheader. Every one passes `validate()` and renders with zero warnings using `defaultBrand`. Their images use only `{{vars}}`, never hotlinked stock art.

| id | Name | Category |
| --- | --- | --- |
| `sales-outreach` | Sales outreach | sales |
| `sales-follow-up` | Follow-up | sales |
| `quote-proposal` | Quote / proposal | sales |
| `invoice-notice` | Invoice notice | finance |
| `payment-receipt` | Payment receipt | finance |
| `support-reply` | Support ticket reply | support |
| `welcome` | Welcome / onboarding | onboarding |
| `monthly-newsletter` | Monthly newsletter (with two columns) | newsletter |
| `festival-greeting` | Festival greeting (warm Dashain/Tihar-season wishes) | newsletter |

```ts
const t = starterTemplates.find((s) => s.id === "invoice-notice")!;
const { html } = render({ ...t.doc, brand: myBrand });
```

## {{vars}} and mail merge

This package does not fill in variables. It leaves them in place for a later mail-merge step (Handlebars, Mustache, or your own), so one rendered template can be reused for every recipient.

- `{{firstName}}`, `{{#if paid}}…{{/if}}`, `{{name|there}}` and similar are copied into the HTML exactly as written. Nothing inside the braces is HTML-escaped. The text around and between them is escaped as usual.
- URLs keep their variables verbatim, so `href="https://pay.test/i/{{invoiceId}}"` stays as written and the braces are never percent-encoded. `validate()` accepts URLs that start with a `{{var}}` (such as `{{unsubscribeUrl}}`) and http(s) URLs that contain one.
- The plain-text output keeps the variables too.
- A variable is `{{` + anything without `{`, `}`, `<` or `>` + `}}`. Text with angle brackets inside braces is treated as normal text and escaped, so a "variable" can't inject tags.
- Inside an attribute, a `"` within a variable is written as `&quot;` so it can't close the attribute.

Values you substitute later are your merge engine's responsibility to escape.

## Client support notes

- **Outlook desktop (Word engine):**
  - A fixed-width MSO conditional table wraps the email.
  - `OfficeDocumentSettings`/`PixelsPerInch` 96 stops DPI scaling.
  - Buttons are VML `v:roundrect` with `fillcolor`. Non-hex colours are converted to hex for VML.
  - Columns use MSO ghost tables.
- **Gmail, Apple Mail, iOS/Android:**
  - Every critical style is inline, so nothing depends on the `<style>` block.
  - The `<style>` block only adds enhancements: a `max-width:600px` media query that stacks columns (`stackOnMobile`) and makes the container full-width, plus dark-mode rules.
  - Columns are inline-block `div`s with `max-width`, so they also wrap without media queries.
- **Preheader:** a hidden span, followed by a hidden run of `&zwnj;&nbsp;` so the preview doesn't pull in body text.
- **Dark mode (`"auto"`):**
  - Adds the `color-scheme`/`supported-color-schemes` meta and CSS.
  - Adds `@media (prefers-color-scheme: dark)` rules.
  - Adds Outlook.com `[data-ogsc]` / `[data-ogsb]` rules that switch backgrounds and text to a fixed dark palette.
  - The logo gets no dark-mode class and no filter, so it is never inverted by our CSS.
  - `"off"` declares light only and emits no dark rules.
- **Images:** always have a `width` attribute and `style="display:block;max-width:100%;height:auto;border:0"`.

## Warnings

`render()` warns about:

- HTML larger than 90KB (Gmail clips at about 102KB);
- a missing preheader;
- body text below 4.5:1 contrast on `background` or `surface`, and text-block colour overrides below 4.5:1 on `surface`;
- button text below 3:1 on the button colour;
- every `html` block;
- image-heavy emails, meaning fewer than 150 characters of text per image (header and footer text don't count);
- images with no alt text;
- dropped unsafe URLs, invalid colours, empty social blocks, and columns with 0 or more than 4 children.

`validate()` reports these errors:

- unknown block types;
- missing required props (per `blockSchema`);
- invalid colours in props or brand;
- URLs that aren't http(s)/mailto/tel/`{{var}}`;
- duplicate ids, including nested ones;
- images without alt (unless decorative);
- `<script>` in an `html` block;
- columns with 0 or more than 4 children;
- `ratios` that don't match the number of columns;
- bad `select` values, non-numeric numbers and non-boolean booleans.

## Limits

- It renders HTML. It does not send email or fill in `{{vars}}`.
- `html` blocks are not sanitized, and their CSS is not inlined. `validate()` only rejects `<script>`.
- Dark mode uses one fixed dark palette, not one derived from your brand. Clients that force their own colour inversion (some Gmail apps, for example) can still change colours, and the CSS can't stop that.
- No web fonts are loaded. `brand.font.family` only applies where it's installed; otherwise `fallback` is used.
- The contrast check covers body text, text-block colour overrides, the header name on a custom background, and buttons. It doesn't check links, muted text, table stripes or the dark palette.
- The Outlook button width is estimated from the label length, so a very long label can wrap.
- The image-heavy check is a simple ratio, not a spam-filter score.
- The `lang` attribute is fixed to `en`, and there is no right-to-left layout mode.
- List items, table rows, column ratios and social links are arrays. `blockSchema` describes them as `string` fields with the line/comma format shown above, because the schema has no array type.

Built by [Lacspace](https://lacspace.com). Licensed under the Lacspace Free Licence v1.0 (see LICENSE).
