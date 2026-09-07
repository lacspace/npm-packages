import { test, expect } from "vitest";
import {
  verifyEmail,
  passwordResetEmail,
  magicLinkEmail,
  notificationEmail,
  orderConfirmationEmail,
  shippingEmail,
  invitationEmail,
  digestEmail,
  announcementEmail,
} from "./index";

// Every template goes through render(), so it must carry a dark-mode media
// query and be a full HTML document.
function assertShell(html: string) {
  expect(html).toContain("<!DOCTYPE html>");
  expect(html).toContain("@media (prefers-color-scheme: dark)");
}

test("verifyEmail renders CTA url + confirmation copy", () => {
  const html = verifyEmail({ verifyUrl: "https://x.io/verify?t=abc", brandName: "Lacspace" });
  assertShell(html);
  expect(html).toContain("https://x.io/verify?t=abc");
  expect(html).toContain("Verify email");
  expect(html).toContain("Confirm your email");
});

test("passwordResetEmail renders reset link + expiry", () => {
  const html = passwordResetEmail({ resetUrl: "https://x.io/reset?t=1", name: "Ada", expiresMinutes: 45 });
  assertShell(html);
  expect(html).toContain("https://x.io/reset?t=1");
  expect(html).toContain("Ada");
  expect(html).toContain("45 minutes");
  expect(html).toContain("Reset password");
});

test("magicLinkEmail renders sign-in link", () => {
  const html = magicLinkEmail({ loginUrl: "https://x.io/magic?t=9" });
  assertShell(html);
  expect(html).toContain("https://x.io/magic?t=9");
  expect(html).toContain("Sign in");
});

test("notificationEmail renders message and optional CTA", () => {
  const noCta = notificationEmail({ title: "Heads up", message: "Something happened." });
  expect(noCta).toContain("Heads up");
  expect(noCta).toContain("Something happened.");
  const withCta = notificationEmail({ title: "Heads up", message: "See it.", ctaHref: "https://x.io/n" });
  expect(withCta).toContain("https://x.io/n");
});

test("orderConfirmationEmail lists items + total + order id", () => {
  const html = orderConfirmationEmail({
    orderId: "A-1001",
    items: [["Widget", "$10"]],
    total: ["Total", "$10"],
    ctaHref: "https://x.io/orders/A-1001",
  });
  assertShell(html);
  expect(html).toContain("A-1001");
  expect(html).toContain("Widget");
  expect(html).toContain("Total");
  expect(html).toContain("https://x.io/orders/A-1001");
});

test("shippingEmail includes carrier + tracking number + tracking button", () => {
  const html = shippingEmail({
    carrier: "DHL",
    trackingNumber: "TRK-42",
    trackingUrl: "https://track.io/TRK-42",
  });
  assertShell(html);
  expect(html).toContain("DHL");
  expect(html).toContain("TRK-42");
  expect(html).toContain("https://track.io/TRK-42");
  expect(html).toContain("Track package");
});

test("invitationEmail renders inviter, team, accept url + expiry", () => {
  const html = invitationEmail({
    acceptUrl: "https://x.io/join?t=7",
    inviterName: "Bob",
    teamName: "Acme",
    expiresDays: 1,
  });
  assertShell(html);
  expect(html).toContain("Bob");
  expect(html).toContain("Acme");
  expect(html).toContain("https://x.io/join?t=7");
  expect(html).toContain("1 day");
});

test("digestEmail renders each item + its link", () => {
  const html = digestEmail({
    intro: "This week",
    items: [
      { title: "First post", text: "Body one", href: "https://x.io/1" },
      { title: "Second post", href: "https://x.io/2" },
    ],
  });
  assertShell(html);
  expect(html).toContain("First post");
  expect(html).toContain("Second post");
  expect(html).toContain("https://x.io/1");
  expect(html).toContain("https://x.io/2");
});

test("announcementEmail renders image, message + learn-more CTA", () => {
  const html = announcementEmail({
    title: "Big news",
    message: "We launched.",
    imageUrl: "https://x.io/hero.png",
    ctaHref: "https://x.io/blog",
  });
  assertShell(html);
  expect(html).toContain("Big news");
  expect(html).toContain("We launched.");
  expect(html).toContain("https://x.io/hero.png");
  expect(html).toContain("https://x.io/blog");
});

test("templates inject the preheader preview text", () => {
  const html = magicLinkEmail({ loginUrl: "https://x.io/m", preheader: "One-tap sign in" } as never);
  // caller-supplied preheader wins
  expect(html).toContain("One-tap sign in");
  // default preheader present otherwise
  const html2 = verifyEmail({ verifyUrl: "https://x.io/v" });
  expect(html2).toMatch(/display:none[^>]*>Confirm your email address/);
});

test("theme brandColor is applied to template buttons", () => {
  const html = passwordResetEmail({ resetUrl: "https://x.io/r", theme: { brandColor: "#ff0066" } });
  expect(html).toContain("#ff0066");
});

test("untrusted values are escaped in templates", () => {
  const html = invitationEmail({ acceptUrl: "https://x.io/j", inviterName: "<script>x</script>" });
  expect(html).not.toContain("<script>x</script>");
  expect(html).toContain("&lt;script&gt;");
});
