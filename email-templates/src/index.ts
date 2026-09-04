/**
 * @lacspace/email-templates
 * Compose bulletproof, responsive HTML emails from simple blocks.
 *
 * No more hand-writing <table> soup. Components return email-client-safe HTML
 * with inline styles; `render()` wraps them in a responsive, dark-mode-aware
 * layout. Ships with ready-made OTP / welcome / alert / invoice templates.
 *
 * Zero dependencies · isomorphic · fully typed.
 */

export interface Theme {
  brandColor: string;
  bg: string;
  cardBg: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  fontFamily: string;
  borderRadius: string;
}

export const defaultTheme: Theme = {
  brandColor: "#2563eb",
  bg: "#f4f5f7",
  cardBg: "#ffffff",
  textColor: "#1f2937",
  mutedColor: "#6b7280",
  borderColor: "#e5e7eb",
  fontFamily:
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  borderRadius: "12px",
};

/** Escape untrusted text before placing it in HTML. */
export function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function theme(t?: Partial<Theme>): Theme {
  return { ...defaultTheme, ...t };
}

/* ------------------------------------------------------------------ *
 * Blocks — each returns an HTML string. Compose them into render().
 * ------------------------------------------------------------------ */

export function heading(text: string, opts: { level?: 1 | 2 | 3; theme?: Partial<Theme> } = {}): string {
  const t = theme(opts.theme);
  const size = opts.level === 3 ? 18 : opts.level === 2 ? 22 : 26;
  return `<h1 class="t" style="margin:0 0 12px;font-family:${t.fontFamily};font-size:${size}px;line-height:1.3;font-weight:700;color:${t.textColor};">${escapeHtml(text)}</h1>`;
}

export function text(content: string, opts: { muted?: boolean; theme?: Partial<Theme> } = {}): string {
  const t = theme(opts.theme);
  const color = opts.muted ? t.mutedColor : t.textColor;
  // Only primary body text carries `.t`; muted text keeps its lighter grey, which
  // already reads on a dark background (see the dark-mode @media rule in render()).
  const cls = opts.muted ? "" : ` class="t"`;
  return `<p${cls} style="margin:0 0 16px;font-family:${t.fontFamily};font-size:15px;line-height:1.6;color:${color};">${escapeHtml(content)}</p>`;
}

/** Raw HTML passthrough — you are responsible for escaping. */
export function html(raw: string): string {
  return raw;
}

/** A bulletproof, table-based CTA button that renders in Outlook too. */
export function button(
  label: string,
  href: string,
  opts: { theme?: Partial<Theme> } = {},
): string {
  const t = theme(opts.theme);
  const safeHref = escapeHtml(href);
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td align="center" bgcolor="${t.brandColor}" style="border-radius:8px;">
<a href="${safeHref}" target="_blank" style="display:inline-block;padding:12px 28px;font-family:${t.fontFamily};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;background:${t.brandColor};">${escapeHtml(label)}</a>
</td></tr></table>`;
}

/** A large, letter-spaced code block — perfect for OTPs. */
export function code(value: string, opts: { theme?: Partial<Theme> } = {}): string {
  const t = theme(opts.theme);
  return `<div style="margin:0 0 20px;padding:16px;text-align:center;background:${t.bg};border:1px solid ${t.borderColor};border-radius:${t.borderRadius};font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:${t.textColor};">${escapeHtml(value)}</div>`;
}

export function divider(opts: { theme?: Partial<Theme> } = {}): string {
  const t = theme(opts.theme);
  return `<hr style="border:none;border-top:1px solid ${t.borderColor};margin:24px 0;" />`;
}

export function spacer(height = 16): string {
  return `<div style="line-height:${height}px;height:${height}px;">&nbsp;</div>`;
}

export function image(src: string, opts: { alt?: string; width?: number } = {}): string {
  const w = opts.width ? `width="${opts.width}" style="max-width:100%;height:auto;display:block;margin:0 auto;"` : `style="max-width:100%;height:auto;display:block;margin:0 auto;"`;
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(opts.alt ?? "")}" ${w} />`;
}

export function list(items: string[], opts: { theme?: Partial<Theme> } = {}): string {
  const t = theme(opts.theme);
  const lis = items
    .map(
      (i) =>
        `<li style="margin:0 0 8px;font-family:${t.fontFamily};font-size:15px;line-height:1.6;color:${t.textColor};">${escapeHtml(i)}</li>`,
    )
    .join("");
  return `<ul style="margin:0 0 16px;padding-left:20px;">${lis}</ul>`;
}

/** A simple two-column key/value table — great for invoices & receipts. */
export function keyValue(
  rows: [string, string][],
  opts: { theme?: Partial<Theme> } = {},
): string {
  const t = theme(opts.theme);
  const body = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 0;font-family:${t.fontFamily};font-size:14px;color:${t.mutedColor};">${escapeHtml(k)}</td><td align="right" style="padding:8px 0;font-family:${t.fontFamily};font-size:14px;font-weight:600;color:${t.textColor};">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-top:1px solid ${t.borderColor};">${body}</table>`;
}

/* ------------------------------------------------------------------ *
 * Layout
 * ------------------------------------------------------------------ */

export interface EmailOptions {
  title?: string;
  /** Hidden inbox-preview text. */
  preheader?: string;
  theme?: Partial<Theme>;
  /** Footer HTML/text (already trusted). */
  footer?: string;
  brandName?: string;
  logoUrl?: string;
  width?: number;
}

/** Wrap composed blocks in a responsive, email-client-safe document. */
export function render(opts: EmailOptions, blocks: string[]): string {
  const t = theme(opts.theme);
  const width = opts.width ?? 600;
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</div>`
    : "";
  const brand = opts.logoUrl
    ? `<img src="${escapeHtml(opts.logoUrl)}" alt="${escapeHtml(opts.brandName ?? "")}" height="32" style="display:block;height:32px;" />`
    : opts.brandName
      ? `<span style="font-family:${t.fontFamily};font-size:18px;font-weight:700;color:${t.brandColor};">${escapeHtml(opts.brandName)}</span>`
      : "";
  const header = brand ? `<tr><td style="padding:0 0 20px;">${brand}</td></tr>` : "";
  const footer = opts.footer
    ? `<tr><td style="padding:24px 8px 0;font-family:${t.fontFamily};font-size:12px;line-height:1.6;color:${t.mutedColor};text-align:center;">${opts.footer}</td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>${escapeHtml(opts.title ?? "")}</title>
<style>
  @media only screen and (max-width:600px){ .container{width:100%!important;} .px{padding-left:20px!important;padding-right:20px!important;} }
  @media (prefers-color-scheme: dark){ body,.bg{background:#0b0b12!important;} .card{background:#16161f!important;} .t{color:#e5e7eb!important;} }
</style>
</head>
<body class="bg" style="margin:0;padding:0;background:${t.bg};">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg" style="background:${t.bg};padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="${width}" class="container" cellpadding="0" cellspacing="0" style="width:${width}px;max-width:${width}px;">
${header}
<tr><td class="card px" style="background:${t.cardBg};border:1px solid ${t.borderColor};border-radius:${t.borderRadius};padding:32px;">
${blocks.join("\n")}
</td></tr>
${footer}
</table>
</td></tr>
</table>
</body>
</html>`;
}

/* ------------------------------------------------------------------ *
 * Ready-made templates
 * ------------------------------------------------------------------ */

export interface BrandInfo {
  brandName?: string;
  logoUrl?: string;
  theme?: Partial<Theme>;
  footer?: string;
}

/** One-time-passcode email. */
export function otpEmail(
  o: { code: string; heading?: string; message?: string; expiresMinutes?: number } & BrandInfo,
): string {
  return render(
    { title: o.heading ?? "Your verification code", preheader: `Your code is ${o.code}`, ...o },
    [
      heading(o.heading ?? "Verify your email", { theme: o.theme }),
      text(o.message ?? "Use the code below to continue. Never share it with anyone.", {
        theme: o.theme,
      }),
      code(o.code, { theme: o.theme }),
      text(
        `This code expires in ${o.expiresMinutes ?? 10} minutes.`,
        { muted: true, theme: o.theme },
      ),
    ],
  );
}

/** Welcome / onboarding email with a CTA. */
export function welcomeEmail(
  o: { name?: string; message?: string; ctaLabel?: string; ctaHref?: string } & BrandInfo,
): string {
  const blocks = [
    heading(o.name ? `Welcome, ${o.name}!` : "Welcome aboard!", { theme: o.theme }),
    text(o.message ?? "We're thrilled to have you. Let's get you started.", { theme: o.theme }),
  ];
  if (o.ctaHref) blocks.push(button(o.ctaLabel ?? "Get started", o.ctaHref, { theme: o.theme }));
  return render({ title: "Welcome", preheader: o.message, ...o }, blocks);
}

/** Alert / notification email. */
export function alertEmail(
  o: { title: string; message: string; ctaLabel?: string; ctaHref?: string } & BrandInfo,
): string {
  const blocks = [
    heading(o.title, { theme: o.theme }),
    text(o.message, { theme: o.theme }),
  ];
  if (o.ctaHref) blocks.push(button(o.ctaLabel ?? "View details", o.ctaHref, { theme: o.theme }));
  return render({ preheader: o.message, ...o }, blocks);
}

/** Invoice / receipt email. */
export function invoiceEmail(
  o: {
    heading?: string;
    intro?: string;
    rows: [string, string][];
    total?: [string, string];
    ctaLabel?: string;
    ctaHref?: string;
  } & BrandInfo,
): string {
  const blocks = [
    heading(o.heading ?? "Payment receipt", { theme: o.theme }),
    text(o.intro ?? "Thanks for your payment. Here's your receipt.", { theme: o.theme }),
    keyValue(o.total ? [...o.rows, o.total] : o.rows, { theme: o.theme }),
  ];
  if (o.ctaHref) blocks.push(button(o.ctaLabel ?? "View invoice", o.ctaHref, { theme: o.theme }));
  return render({ title: o.heading ?? "Receipt", ...o }, blocks);
}
