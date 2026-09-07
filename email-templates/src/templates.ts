/**
 * Additional ready-made transactional templates.
 *
 * Each returns a full HTML email string via `render()`, so they inherit the
 * responsive layout, `@media (prefers-color-scheme: dark)` support, bulletproof
 * buttons and preheader slot. Signatures mirror the built-in
 * `otpEmail` / `welcomeEmail` / `alertEmail` / `invoiceEmail` style: a single
 * options object that spreads `BrandInfo` (brandName / logoUrl / theme / footer).
 */

import {
  render,
  heading,
  text,
  button,
  keyValue,
  divider,
  image,
  type BrandInfo,
  type Theme,
} from "./index";

/** Email-address verification via a confirmation link. */
export function verifyEmail(
  o: {
    verifyUrl: string;
    heading?: string;
    message?: string;
    ctaLabel?: string;
    expiresMinutes?: number;
  } & BrandInfo,
): string {
  const blocks = [
    heading(o.heading ?? "Confirm your email", { theme: o.theme }),
    text(o.message ?? "Please confirm your email address to activate your account.", {
      theme: o.theme,
    }),
    button(o.ctaLabel ?? "Verify email", o.verifyUrl, { theme: o.theme }),
    text(
      o.expiresMinutes
        ? `This link expires in ${o.expiresMinutes} minutes. If you didn't create an account, you can ignore this email.`
        : "If you didn't create an account, you can safely ignore this email.",
      { muted: true, theme: o.theme },
    ),
  ];
  return render(
    { title: o.heading ?? "Confirm your email", preheader: o.message ?? "Confirm your email address", ...o },
    blocks,
  );
}

/** Password-reset email with a reset link. */
export function passwordResetEmail(
  o: {
    resetUrl: string;
    name?: string;
    heading?: string;
    message?: string;
    ctaLabel?: string;
    expiresMinutes?: number;
  } & BrandInfo,
): string {
  const blocks = [
    heading(o.heading ?? "Reset your password", { theme: o.theme }),
    text(
      o.message ??
        (o.name
          ? `Hi ${o.name}, we received a request to reset your password. Click below to choose a new one.`
          : "We received a request to reset your password. Click below to choose a new one."),
      { theme: o.theme },
    ),
    button(o.ctaLabel ?? "Reset password", o.resetUrl, { theme: o.theme }),
    text(
      `This link expires in ${o.expiresMinutes ?? 30} minutes. If you didn't request a reset, you can safely ignore this email — your password won't change.`,
      { muted: true, theme: o.theme },
    ),
  ];
  return render({ title: o.heading ?? "Reset your password", preheader: "Reset your password", ...o }, blocks);
}

/** Passwordless magic-link sign-in email. */
export function magicLinkEmail(
  o: {
    loginUrl: string;
    heading?: string;
    message?: string;
    ctaLabel?: string;
    expiresMinutes?: number;
  } & BrandInfo,
): string {
  const blocks = [
    heading(o.heading ?? "Your sign-in link", { theme: o.theme }),
    text(o.message ?? "Click the button below to sign in. This link works once and only for you.", {
      theme: o.theme,
    }),
    button(o.ctaLabel ?? "Sign in", o.loginUrl, { theme: o.theme }),
    text(
      `This link expires in ${o.expiresMinutes ?? 15} minutes. If you didn't request it, you can safely ignore this email.`,
      { muted: true, theme: o.theme },
    ),
  ];
  return render({ title: o.heading ?? "Your sign-in link", preheader: "Your sign-in link", ...o }, blocks);
}

/** General notification / alert email (alias-style twin of `alertEmail`). */
export function notificationEmail(
  o: {
    title: string;
    message: string;
    ctaLabel?: string;
    ctaHref?: string;
  } & BrandInfo,
): string {
  const blocks = [heading(o.title, { theme: o.theme }), text(o.message, { theme: o.theme })];
  if (o.ctaHref) blocks.push(button(o.ctaLabel ?? "View", o.ctaHref, { theme: o.theme }));
  return render({ preheader: o.message, ...o }, blocks);
}

/** Order-confirmation email with an itemised summary. */
export function orderConfirmationEmail(
  o: {
    orderId?: string;
    heading?: string;
    intro?: string;
    items?: [string, string][];
    total?: [string, string];
    ctaLabel?: string;
    ctaHref?: string;
  } & BrandInfo,
): string {
  const rows = o.items ?? [];
  const blocks = [
    heading(o.heading ?? "Order confirmed", { theme: o.theme }),
    text(
      o.intro ??
        (o.orderId
          ? `Thanks for your order! Your order ${o.orderId} is confirmed.`
          : "Thanks for your order! It's confirmed and being processed."),
      { theme: o.theme },
    ),
    keyValue(o.total ? [...rows, o.total] : rows, { theme: o.theme }),
  ];
  if (o.ctaHref) blocks.push(button(o.ctaLabel ?? "View order", o.ctaHref, { theme: o.theme }));
  return render({ title: o.heading ?? "Order confirmed", preheader: o.intro ?? "Your order is confirmed", ...o }, blocks);
}

/** Shipping / dispatch notification with tracking details. */
export function shippingEmail(
  o: {
    heading?: string;
    intro?: string;
    carrier?: string;
    trackingNumber?: string;
    trackingUrl?: string;
    rows?: [string, string][];
    ctaLabel?: string;
  } & BrandInfo,
): string {
  const details: [string, string][] = [...(o.rows ?? [])];
  if (o.carrier) details.push(["Carrier", o.carrier]);
  if (o.trackingNumber) details.push(["Tracking number", o.trackingNumber]);
  const blocks = [
    heading(o.heading ?? "Your order is on its way", { theme: o.theme }),
    text(o.intro ?? "Good news — your order has shipped. Track its progress below.", { theme: o.theme }),
  ];
  if (details.length) blocks.push(keyValue(details, { theme: o.theme }));
  if (o.trackingUrl) blocks.push(button(o.ctaLabel ?? "Track package", o.trackingUrl, { theme: o.theme }));
  return render(
    { title: o.heading ?? "Your order has shipped", preheader: o.intro ?? "Your order has shipped", ...o },
    blocks,
  );
}

/** Invitation to join a team / workspace / event. */
export function invitationEmail(
  o: {
    acceptUrl: string;
    inviterName?: string;
    teamName?: string;
    heading?: string;
    message?: string;
    ctaLabel?: string;
    expiresDays?: number;
  } & BrandInfo,
): string {
  const who = o.inviterName ? `${o.inviterName} invited you` : "You're invited";
  const where = o.teamName ? ` to join ${o.teamName}` : "";
  const blocks = [
    heading(o.heading ?? `${who}${where}`, { theme: o.theme }),
    text(o.message ?? "Accept the invitation below to get started.", { theme: o.theme }),
    button(o.ctaLabel ?? "Accept invitation", o.acceptUrl, { theme: o.theme }),
  ];
  if (o.expiresDays) {
    blocks.push(
      text(`This invitation expires in ${o.expiresDays} day${o.expiresDays === 1 ? "" : "s"}.`, {
        muted: true,
        theme: o.theme,
      }),
    );
  }
  return render(
    { title: o.heading ?? "You're invited", preheader: `${who}${where}`, ...o },
    blocks,
  );
}

/** Digest / roundup email listing multiple items with links. */
export function digestEmail(
  o: {
    heading?: string;
    intro?: string;
    items: { title: string; text?: string; href?: string }[];
    ctaLabel?: string;
    ctaHref?: string;
  } & BrandInfo,
): string {
  const t: Partial<Theme> | undefined = o.theme;
  const blocks: string[] = [heading(o.heading ?? "Your digest", { theme: t })];
  if (o.intro) blocks.push(text(o.intro, { theme: t }));

  o.items.forEach((item, i) => {
    if (i > 0) blocks.push(divider({ theme: t }));
    blocks.push(heading(item.title, { level: 3, theme: t }));
    if (item.text) blocks.push(text(item.text, { theme: t }));
    if (item.href) blocks.push(button(o.ctaLabel ?? "Read more", item.href, { theme: t }));
  });

  if (o.ctaHref) {
    blocks.push(divider({ theme: t }));
    blocks.push(button(o.ctaLabel ?? "View all", o.ctaHref, { theme: t }));
  }
  return render(
    { title: o.heading ?? "Your digest", preheader: o.intro ?? "Here's your latest digest", ...o },
    blocks,
  );
}

/** Plain announcement / broadcast email. */
export function announcementEmail(
  o: {
    heading?: string;
    title?: string;
    message: string;
    imageUrl?: string;
    imageAlt?: string;
    ctaLabel?: string;
    ctaHref?: string;
  } & BrandInfo,
): string {
  const head = o.heading ?? o.title ?? "Announcement";
  const blocks: string[] = [];
  if (o.imageUrl) blocks.push(image(o.imageUrl, { alt: o.imageAlt ?? head }));
  blocks.push(heading(head, { theme: o.theme }));
  blocks.push(text(o.message, { theme: o.theme }));
  if (o.ctaHref) blocks.push(button(o.ctaLabel ?? "Learn more", o.ctaHref, { theme: o.theme }));
  return render({ title: head, preheader: o.message, ...o }, blocks);
}
