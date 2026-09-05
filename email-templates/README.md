<div align="center">

# @lacspace/email-templates

**Compose bulletproof, responsive HTML emails from simple blocks — no more `<table>` soup.**

[![npm version](https://img.shields.io/npm/v/@lacspace/email-templates?color=%23e11d48&label=npm)](https://www.npmjs.com/package/@lacspace/email-templates)
[![install size](https://packagephobia.com/badge?p=@lacspace/email-templates)](https://packagephobia.com/result?p=@lacspace/email-templates)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/email-templates?label=minzip)](https://bundlephobia.com/package/@lacspace/email-templates)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/email-templates)
[![license](https://img.shields.io/npm/l/@lacspace/email-templates?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Components return email-client-safe HTML with inline styles; `render()` wraps them in a responsive, dark-mode-aware layout that survives Outlook. Includes ready-made **OTP / welcome / alert / invoice** templates. A tiny, dependency-free alternative to MJML.

- 🧱 Blocks: `heading` · `text` · `button` (bulletproof) · `code` (OTP) · `divider` · `image` · `list` · `keyValue`
- 📱 Responsive `render()` + `@media (prefers-color-scheme: dark)`
- 🎨 Themeable (brand color, fonts, radius) · logo/brand header · preheader text
- 🛡️ Auto-escapes untrusted text
- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

## Install

```bash
npm install @lacspace/email-templates      # or pnpm add / yarn add / bun add
```

## Ready-made templates

```ts
import { otpEmail, welcomeEmail, alertEmail, invoiceEmail } from "@lacspace/email-templates";

const html = otpEmail({
  code: "482913",
  brandName: "Lacspace",
  expiresMinutes: 10,
});

welcomeEmail({ name: "Aayush", ctaLabel: "Open dashboard", ctaHref: "https://one.lacspace.com" });
alertEmail({ title: "Server is back up", message: "api.lacspace.com recovered at 14:32." });
invoiceEmail({
  heading: "Payment receipt",
  rows: [["Plan", "Pro"], ["Period", "Aug 2026"]],
  total: ["Total", "₹1,499.00"],
  ctaHref: "https://one.lacspace.com/invoices/123",
});
```

## Compose your own

```ts
import { render, heading, text, button, divider } from "@lacspace/email-templates";

const html = render(
  { title: "Reset your password", preheader: "Link expires in 30 minutes", brandName: "Lacspace" },
  [
    heading("Reset your password"),
    text("Click the button below to choose a new password."),
    button("Reset password", "https://lacspace.com/reset?token=abc"),
    divider(),
    text("If you didn't request this, you can safely ignore this email.", { muted: true }),
  ],
);
```

## Theme it

```ts
render(
  { title: "Hi", theme: { brandColor: "#7c3aed", borderRadius: "16px" } },
  [heading("On brand"), button("Go", "https://x.com", { theme: { brandColor: "#7c3aed" } })],
);
```

## Send it

```ts
import { createMailer, presets } from "@lacspace/mailer";
const mail = createMailer(presets.hostinger({ user, pass }));
await mail.send({ to, subject: "Your code", html: otpEmail({ code: "482913" }) });
```

## Blocks

| Block | Renders |
| --- | --- |
| `heading(text, { level })` | h1/h2/h3 |
| `text(content, { muted })` | paragraph |
| `button(label, href)` | bulletproof table CTA |
| `code(value)` | large letter-spaced code (OTP) |
| `keyValue(rows)` | 2-column table (receipts) |
| `list(items)` · `divider()` · `spacer(h)` · `image(src)` | misc |
| `render(opts, blocks)` | full responsive document |

## The Lacspace MailKit

| Package | For |
| --- | --- |
| [`@lacspace/mailer`](https://www.npmjs.com/package/@lacspace/mailer) | Send email over SMTP |
| **`@lacspace/email-templates`** | Build responsive HTML emails (this package) |
| [`@lacspace/email-validate`](https://www.npmjs.com/package/@lacspace/email-validate) | Validate & normalize addresses |
| [`@lacspace/email-verify`](https://www.npmjs.com/package/@lacspace/email-verify) | MX + SMTP deliverability checks |

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/email-templates` is part of **63 zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/email-templates
- 🗂️ **All 63 packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

