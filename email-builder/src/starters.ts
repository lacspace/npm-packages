import type { Block, StarterTemplate } from "./types";

const header = (id = "header"): Block => ({ id, type: "header", props: { align: "left" } });
const footer = (note: string, id = "footer"): Block => ({ id, type: "footer", props: { note } });
const h1 = (id: string, content: string): Block => ({ id, type: "text", props: { variant: "h1", content } });
const text = (id: string, content: string): Block => ({ id, type: "text", props: { content } });
const button = (id: string, label: string, url: string): Block => ({ id, type: "button", props: { text: label, url } });
const divider = (id: string): Block => ({ id, type: "divider", props: {} });

/**
 * Ready-made documents. The brand is applied at render time, so every starter
 * works with any Brand. Images use only {{vars}} (no hotlinked stock art).
 */
export const starterTemplates: StarterTemplate[] = [
  {
    id: "sales-outreach",
    name: "Sales outreach",
    category: "sales",
    doc: {
      preheader: "A quick idea for {{companyName|your team}}, and a 20-minute call if it helps.",
      blocks: [
        header(),
        h1("title", "Hi {{firstName|there}}, a quick idea for {{companyName|your team}}"),
        text(
          "intro",
          "<p>I noticed {{companyName|your team}} is growing fast, and teams at that stage often lose hours every week to manual work that could run on its own.</p><p>We help businesses like yours set up simple, reliable systems so people can focus on customers instead of spreadsheets.</p>",
        ),
        {
          id: "benefits",
          type: "list",
          props: {
            items: [
              "Set up in days, not months",
              "Works with the tools you already use",
              "A named person to talk to, not a ticket queue",
            ],
          },
        },
        button("cta", "Book a 20-minute call", "{{bookingUrl}}"),
        text("signoff", "<p>If now isn't a good time, just reply and let me know.</p><p>Best,<br>{{senderName}}</p>"),
        footer("You are receiving this because we thought this might be useful to {{companyName|your team}}."),
      ],
    },
  },
  {
    id: "sales-follow-up",
    name: "Follow-up",
    category: "sales",
    doc: {
      preheader: "Following up on my last note, with one short question.",
      blocks: [
        header(),
        text(
          "body",
          "<p>Hi {{firstName|there}},</p><p>I wanted to follow up on my email from last week. I know inboxes get busy, so here is the short version: we can help {{companyName|your team}} save time on repetitive work, and a short call is the easiest way to see if it fits.</p><p>Would any time this week or next work for you?</p>",
        ),
        button("cta", "Pick a time", "{{bookingUrl}}"),
        text("signoff", "<p>Thanks,<br>{{senderName}}</p>"),
        footer("Not the right person? Reply and let us know who is, and we won't follow up again."),
      ],
    },
  },
  {
    id: "quote-proposal",
    name: "Quote / proposal",
    category: "sales",
    doc: {
      preheader: "Your quote {{quoteNumber}} is ready to review.",
      blocks: [
        header(),
        h1("title", "Your quote is ready"),
        text(
          "intro",
          "<p>Hi {{firstName|there}},</p><p>Thank you for the conversation. Here is a summary of the proposal we discussed. The full quote, with scope and terms, is available at the link below.</p>",
        ),
        {
          id: "summary",
          type: "table",
          props: {
            headerRow: true,
            rows: [
              ["Item", "Details"],
              ["Quote number", "{{quoteNumber}}"],
              ["Scope", "{{quoteScope}}"],
              ["Total", "{{quoteTotal}}"],
              ["Valid until", "{{quoteValidUntil}}"],
            ],
          },
        },
        button("cta", "View the full quote", "{{quoteUrl}}"),
        text("signoff", "<p>Happy to walk through any part of it on a call. Just reply to this email.</p><p>Best,<br>{{senderName}}</p>"),
        footer("You are receiving this because you requested a quote from us."),
      ],
    },
  },
  {
    id: "invoice-notice",
    name: "Invoice notice",
    category: "finance",
    doc: {
      preheader: "Invoice {{invoiceNumber}} for {{amountDue}} is due on {{dueDate}}.",
      blocks: [
        header(),
        h1("title", "Invoice {{invoiceNumber}}"),
        text(
          "intro",
          "<p>Hi {{firstName|there}},</p><p>A new invoice has been issued for your account. Please find the details below. You can view and pay it online using the button.</p>",
        ),
        {
          id: "details",
          type: "table",
          props: {
            headerRow: false,
            rows: [
              ["Invoice number", "{{invoiceNumber}}"],
              ["Issue date", "{{issueDate}}"],
              ["Due date", "{{dueDate}}"],
              ["<b>Amount due</b>", "<b>{{amountDue}}</b>"],
            ],
          },
        },
        button("cta", "View and pay invoice", "{{invoiceUrl}}"),
        text("note", "<p>If you have already paid, please ignore this message. Questions about this invoice? Just reply and our team will help.</p>"),
        footer("This is a service message about your account."),
      ],
    },
  },
  {
    id: "payment-receipt",
    name: "Payment receipt",
    category: "finance",
    doc: {
      preheader: "We received your payment of {{amountPaid}}. Thank you.",
      blocks: [
        header(),
        h1("title", "Payment received"),
        text(
          "intro",
          "<p>Hi {{firstName|there}},</p><p>Thank you. We have received your payment. Keep this email for your records.</p>",
        ),
        {
          id: "details",
          type: "table",
          props: {
            headerRow: false,
            rows: [
              ["Receipt number", "{{receiptNumber}}"],
              ["Payment date", "{{paymentDate}}"],
              ["Payment method", "{{paymentMethod}}"],
              ["<b>Amount paid</b>", "<b>{{amountPaid}}</b>"],
            ],
          },
        },
        button("cta", "Download receipt", "{{receiptUrl}}"),
        text("note", "<p>If anything looks wrong, reply to this email and we will sort it out.</p>"),
        footer("This is a service message about your account."),
      ],
    },
  },
  {
    id: "support-reply",
    name: "Support ticket reply",
    category: "support",
    doc: {
      preheader: "An update on your request #{{ticketId}}.",
      blocks: [
        header(),
        { id: "title", type: "text", props: { variant: "h2", content: "Update on request #{{ticketId}}" } },
        text(
          "body",
          "<p>Hi {{firstName|there}},</p><p>Thanks for your patience. Here is the latest on your request:</p><p>{{replyBody}}</p>",
        ),
        {
          id: "quote",
          type: "quote",
          props: { content: "{{originalMessage}}", cite: "Your original message" },
        },
        button("cta", "View your request", "{{ticketUrl}}"),
        text("signoff", "<p>Reply to this email if you need anything else. It goes straight to our support team.</p><p>{{agentName}}<br>Support team</p>"),
        footer("You are receiving this because you contacted our support team."),
      ],
    },
  },
  {
    id: "welcome",
    name: "Welcome / onboarding",
    category: "onboarding",
    doc: {
      preheader: "Welcome aboard, {{firstName|there}}. Here is how to get started.",
      blocks: [
        header(),
        h1("title", "Welcome, {{firstName|there}}!"),
        text(
          "intro",
          "<p>We are glad you are here. Your account is ready, and these three steps will help you get the most out of it in your first week.</p>",
        ),
        {
          id: "steps",
          type: "list",
          props: {
            ordered: true,
            items: ["<b>Complete your profile</b> so your team knows who you are.", "<b>Invite your teammates</b> to work together.", "<b>Explore the guides</b> for tips and shortcuts."],
          },
        },
        button("cta", "Get started", "{{dashboardUrl}}"),
        divider("divider"),
        text("help", "<p>Need a hand? Reply to this email or visit our <a href=\"{{helpUrl}}\">help centre</a>. A real person will get back to you.</p>"),
        footer("You are receiving this because you created an account with us."),
      ],
    },
  },
  {
    id: "monthly-newsletter",
    name: "Monthly newsletter",
    category: "newsletter",
    doc: {
      preheader: "{{month}} highlights: what's new, what's next and one thing worth reading.",
      blocks: [
        header(),
        {
          id: "hero",
          type: "image",
          props: { src: "{{heroImageUrl}}", alt: "{{heroImageAlt|This month's highlight}}" },
        },
        h1("title", "{{month}} at a glance"),
        text(
          "intro",
          "<p>Hi {{firstName|there}},</p><p>Here is a short round-up of what happened this month, what we are working on next, and a few things we think you will find useful.</p>",
        ),
        {
          id: "cols",
          type: "columns",
          props: { gap: 24 },
          children: [
            {
              id: "col-new",
              type: "text",
              props: { variant: "h3", content: "What's new" },
              children: [
                { id: "col-new-body", type: "text", props: { content: "{{whatsNew}}" } },
              ],
            },
            {
              id: "col-next",
              type: "text",
              props: { variant: "h3", content: "Coming next" },
              children: [
                { id: "col-next-body", type: "text", props: { content: "{{comingNext}}" } },
              ],
            },
          ],
        },
        divider("divider"),
        text("feature", "<p><b>Worth reading:</b> {{featureTitle}}. {{featureSummary}}</p>"),
        button("cta", "Read more", "{{featureUrl}}"),
        footer("You are receiving this because you subscribed to our monthly newsletter."),
      ],
    },
  },
  {
    id: "festival-greeting",
    name: "Festival greeting",
    category: "newsletter",
    doc: {
      preheader: "Warm wishes to you and your family this festive season.",
      blocks: [
        header(),
        {
          id: "hero",
          type: "image",
          props: { src: "{{festivalImageUrl}}", alt: "Festive greetings" },
        },
        h1("title", "Warm wishes this festive season"),
        text(
          "body",
          "<p>Dear {{firstName|friend}},</p><p>As homes fill with light, colour and family, all of us want to thank you for being part of our journey this year. May this Dashain and Tihar bring you good health, happiness and prosperity, and may the year ahead be full of new beginnings.</p><p>Our team will be taking a short break to celebrate with our families. Our office will be closed from {{closedFrom}} to {{closedUntil}}, and we will reply to every message as soon as we are back.</p>",
        ),
        text("signoff", "<p>With warm wishes,<br>Everyone at {{companyName|our team}}</p>"),
        footer("You are receiving this because you are a valued customer or partner."),
      ],
    },
  },
];
