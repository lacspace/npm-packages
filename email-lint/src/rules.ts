import type { RuleId, RuleMeta } from "./types";

const OUTLOOK = ["Outlook (Windows)"];
const GMAIL = ["Gmail"];

/** Every rule, its default severity and what it checks. Order is the report order within a severity. */
export const RULES: Record<RuleId, RuleMeta> = {
  // size
  "html.too_large": {
    severity: "warn",
    description: "HTML part is near or over the ~102KB size at which Gmail clips the message behind a \"View entire message\" link.",
    clients: GMAIL,
    escalates: "warn above 90KB, error above 102KB",
  },
  "attachment.large": {
    severity: "warn",
    description: "Attachments are large. Gmail limits a message to 25MB, some providers allow less, and base64 encoding makes files about a third bigger in transit.",
    escalates: "warn above 10MB total, error above 25MB total",
  },
  "attachment.risky_type": {
    severity: "error",
    description: "An attachment type that mail providers commonly block or quarantine (.exe .js .scr .bat .vbs .jar .iso .docm .xlsm).",
  },
  // content
  "text.missing_plain": {
    severity: "info",
    description: "HTML without a plain-text alternative. Some filters treat HTML-only mail as a weak spam signal, and text-only clients show nothing useful.",
  },
  "images.only": {
    severity: "error",
    description: "The message is images with almost no text. With images blocked it is blank, and image-only mail is a well-known spam pattern.",
  },
  "images.high_ratio": {
    severity: "warn",
    description: "Very little text for the number of images (fewer than 40 words per image).",
  },
  "images.missing_alt": {
    severity: "warn",
    description: "Images without an alt attribute. When images are blocked, readers and screen readers get nothing.",
  },
  "images.no_dimensions": {
    severity: "info",
    description: "Images without width/height. Some clients render them at their natural size or shift the layout while loading.",
  },
  "links.text_mismatch": {
    severity: "error",
    description: "Link text shows a URL or domain that is different from where the link actually goes. This is the classic phishing pattern.",
  },
  "links.shortener": {
    severity: "warn",
    description: "Public URL shorteners (bit.ly, tinyurl, goo.gl, t.co, ow.ly, is.gd, cutt.ly, rebrand.ly) hide the destination and are widely abused by spammers.",
  },
  "links.ip_address": {
    severity: "error",
    description: "Links that point to a raw IP address instead of a domain.",
  },
  "links.http_insecure": {
    severity: "info",
    description: "Links that use http:// instead of https://.",
  },
  "links.too_many": {
    severity: "warn",
    description: "More than 50 links in one message.",
  },
  "links.javascript": {
    severity: "error",
    description: "javascript: links. Mail clients do not run them and filters treat them as hostile.",
  },
  "links.empty": {
    severity: "warn",
    description: "Links with no destination (no href, an empty href or \"#\").",
  },
  // subject
  "subject.missing": {
    severity: "warn",
    description: "No subject line.",
  },
  "subject.too_long": {
    severity: "warn",
    description: "Subject longer than 78 characters. A display heuristic: most inboxes cut it off well before that.",
  },
  "subject.all_caps": {
    severity: "warn",
    description: "Subject is mostly CAPITAL LETTERS.",
  },
  "subject.excess_punctuation": {
    severity: "warn",
    description: "Subject has repeated punctuation or symbols such as \"!!!\", \"??\" or \"$$$\".",
  },
  "subject.spammy": {
    severity: "warn",
    description: "Subject contains phrases commonly seen in spam.",
  },
  "subject.fake_reply": {
    severity: "warn",
    description: "A bulk message whose subject starts with \"Re:\" or \"Fwd:\" pretends to be part of a conversation.",
    bulkOnly: true,
  },
  "subject.emoji_heavy": {
    severity: "info",
    description: "Three or more emoji in the subject.",
  },
  // body
  "body.spammy_phrases": {
    severity: "warn",
    description: "Body text contains phrases commonly seen in spam.",
    escalates: "error at 5 or more different phrases",
  },
  "body.all_caps_ratio": {
    severity: "warn",
    description: "A quarter or more of the words are in CAPITAL LETTERS.",
  },
  "body.excess_exclamation": {
    severity: "warn",
    description: "Repeated exclamation marks (\"!!\") or more than 5 in the body.",
  },
  "body.hidden_text": {
    severity: "warn",
    description: "Text hidden with display:none, visibility:hidden, opacity:0, font-size:0, or coloured the same as its background. One hidden preheader under 150 characters is allowed.",
  },
  // css / clients
  "css.script": {
    severity: "error",
    description: "<script> tags or on* event handlers. Gmail and every other mainstream client strip them, and filters treat them as hostile.",
    clients: GMAIL,
  },
  "css.external_stylesheet": {
    severity: "warn",
    description: "<link rel=\"stylesheet\">: external stylesheets are not loaded by Gmail, so the message renders unstyled.",
    clients: GMAIL,
  },
  "css.import": {
    severity: "warn",
    description: "CSS @import is not reliably supported in email clients.",
  },
  "css.layout_unsupported": {
    severity: "warn",
    description: "position:absolute/fixed or display:flex/grid. Outlook on Windows (Word rendering engine) ignores them and the layout falls apart.",
    clients: OUTLOOK,
  },
  "css.background_image": {
    severity: "info",
    description: "CSS background images are not shown by Outlook on Windows without VML fallbacks.",
    clients: OUTLOOK,
  },
  "html.form": {
    severity: "warn",
    description: "Forms or form fields. Many clients disable or strip them.",
  },
  "html.embed": {
    severity: "warn",
    description: "<iframe>, <video>, <embed> or <object>. Most clients strip or ignore them.",
  },
  "svg.inline": {
    severity: "warn",
    description: "Inline <svg>. Gmail does not render it.",
    clients: GMAIL,
  },
  "images.base64": {
    severity: "warn",
    description: "Images embedded as data: URIs. Gmail does not show them and they inflate the message size.",
    clients: GMAIL,
  },
  // compliance
  "bulk.no_unsubscribe": {
    severity: "error",
    description: "Bulk mail with neither a List-Unsubscribe header nor a visible unsubscribe link.",
    bulkOnly: true,
  },
  "bulk.no_one_click": {
    severity: "warn",
    description: "Bulk mail without RFC 8058 one-click unsubscribe (List-Unsubscribe with an https URL plus \"List-Unsubscribe-Post: List-Unsubscribe=One-Click\"), which Gmail and Yahoo require of bulk senders.",
    bulkOnly: true,
  },
  "bulk.no_postal_address": {
    severity: "info",
    description: "No postal address found in the body (heuristic). Laws such as the US CAN-SPAM Act require one in commercial mail.",
    bulkOnly: true,
  },
  // other
  "from.noreply": {
    severity: "info",
    description: "A no-reply From address. Readers cannot answer, and replies are a positive engagement signal.",
  },
  "preheader.missing": {
    severity: "info",
    description: "Bulk HTML mail with no preview text, so the inbox shows whatever text comes first.",
    bulkOnly: true,
  },
  "html.malformed": {
    severity: "info",
    description: "Unclosed or stray HTML tags. Clients repair them differently, so the layout can differ between inboxes.",
    escalates: "warn at more than 3 problems",
  },
};

export const RULE_IDS = Object.keys(RULES) as RuleId[];
