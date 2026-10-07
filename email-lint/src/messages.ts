import type { Locale, RuleId } from "./types";

export interface Detail {
  count?: number;
  sample?: string;
  /** Rule-specific number (KB, MB, characters, ...). */
  n?: number;
  /** Rule-specific variant. */
  variant?: string;
}

interface Text {
  message: string;
  fix?: string;
}

type Msg = (d: Detail) => Text;

const plural = (n: number | undefined, one: string, many: string) => `${n ?? 1} ${(n ?? 1) === 1 ? one : many}`;

const EN: Record<RuleId, Msg> = {
  "html.too_large": (d) =>
    d.variant === "clip"
      ? { message: `The HTML is ${d.n}KB. Gmail clips messages over about 102KB, so the end of your email (often the unsubscribe link) will be hidden behind "View entire message".`, fix: "Cut the HTML down: remove unused CSS, comments and repeated inline styles, or move content to a web page and link to it." }
      : { message: `The HTML is ${d.n}KB, close to the ~102KB point where Gmail clips messages.`, fix: "Trim unused CSS, comments and repeated inline styles to leave headroom." },
  "attachment.large": (d) => ({
    message: d.variant === "over"
      ? `Attachments total ${d.n}MB. That is over Gmail's 25MB limit, so the message will likely bounce.`
      : `Attachments total ${d.n}MB. Large messages are slow to deliver and some providers reject them.`,
    fix: "Share big files as a download link instead of attaching them.",
  }),
  "attachment.risky_type": (d) => ({
    message: `${plural(d.count, "attachment has", "attachments have")} a file type that mail providers commonly block (${d.sample}).`,
    fix: "Share the file through a download link, or send a safer format (for example PDF instead of a macro-enabled document).",
  }),
  "text.missing_plain": () => ({
    message: "There is no plain-text version of this email.",
    fix: "Add a plain-text part with the same content. Most email builders can generate one.",
  }),
  "images.only": () => ({
    message: "This email is almost entirely images. With images turned off it looks blank, and image-only mail is a common spam pattern.",
    fix: "Put the key message, offer and call to action in real text, and keep images as support.",
  }),
  "images.high_ratio": (d) => ({
    message: `There is very little text for ${plural(d.count, "image", "images")} (about ${d.n} words per image).`,
    fix: "Add more real text, or use fewer images.",
  }),
  "images.missing_alt": (d) => ({
    message: `${plural(d.count, "image has", "images have")} no alt text, so readers with images off (and screen-reader users) see nothing.`,
    fix: "Add an alt attribute describing each image. Use alt=\"\" for purely decorative images.",
  }),
  "images.no_dimensions": (d) => ({
    message: `${plural(d.count, "image has", "images have")} no width or height set.`,
    fix: "Set width and height attributes so the layout holds before images load and in clients that ignore CSS sizing.",
  }),
  "links.text_mismatch": (d) => ({
    message: `${plural(d.count, "link shows", "links show")} one web address but ${(d.count ?? 1) === 1 ? "goes" : "go"} somewhere else (${d.sample}). Filters treat this as phishing.`,
    fix: "Make the visible text match the real destination, or use descriptive words (\"Read the report\") instead of a URL.",
  }),
  "links.shortener": (d) => ({
    message: `${plural(d.count, "link uses", "links use")} a public URL shortener (${d.sample}), which hides the destination and is common in spam.`,
    fix: "Link to the full URL on your own domain, or use a branded short domain you control.",
  }),
  "links.ip_address": (d) => ({
    message: `${plural(d.count, "link points", "links point")} to a raw IP address (${d.sample}).`,
    fix: "Link to a proper domain name.",
  }),
  "links.http_insecure": (d) => ({
    message: `${plural(d.count, "link uses", "links use")} http:// instead of https://.`,
    fix: "Switch links to https://.",
  }),
  "links.too_many": (d) => ({
    message: `This email has ${d.count} links, which is a lot for one message.`,
    fix: "Keep the links that matter; fewer, clearer calls to action also tend to get more clicks.",
  }),
  "links.javascript": (d) => ({
    message: `${plural(d.count, "link uses", "links use")} javascript:, which no email client runs and filters treat as hostile.`,
    fix: "Replace it with a normal https:// link.",
  }),
  "links.empty": (d) => ({
    message: `${plural(d.count, "link goes", "links go")} nowhere (missing, empty or "#" href).`,
    fix: "Give every link a real destination or remove the link.",
  }),
  "subject.missing": () => ({
    message: "The subject line is empty.",
    fix: "Write a short, specific subject that says what is inside.",
  }),
  "subject.too_long": (d) => ({
    message: `The subject is ${d.n} characters long, so most inboxes will cut it off.`,
    fix: "Keep the important words in the first 40–50 characters.",
  }),
  "subject.all_caps": () => ({
    message: "The subject is mostly in CAPITAL LETTERS, which reads as shouting and looks like spam.",
    fix: "Use normal sentence case.",
  }),
  "subject.excess_punctuation": (d) => ({
    message: `The subject has repeated punctuation or symbols (${d.sample}).`,
    fix: "Use at most one exclamation mark and no \"$$$\".",
  }),
  "subject.spammy": (d) => ({
    message: `The subject contains spam-like wording: ${d.sample}.`,
    fix: "Rephrase it to describe the actual content plainly.",
  }),
  "subject.fake_reply": () => ({
    message: "This is a bulk email, but the subject starts with \"Re:\" or \"Fwd:\" as if it were a reply. Readers and filters see that as deceptive.",
    fix: "Remove the Re:/Fwd: prefix.",
  }),
  "subject.emoji_heavy": (d) => ({
    message: `The subject has ${d.count} emoji.`,
    fix: "One emoji is plenty; some clients show them as empty boxes.",
  }),
  "body.spammy_phrases": (d) => ({
    message: `The text contains ${plural(d.count, "spam-like phrase", "spam-like phrases")}: ${d.sample}.`,
    fix: "Rewrite those lines in plain, specific language.",
  }),
  "body.all_caps_ratio": (d) => ({
    message: `About ${d.n}% of the words are in CAPITAL LETTERS.`,
    fix: "Use capitals only for names and acronyms; use bold for emphasis.",
  }),
  "body.excess_exclamation": (d) => ({
    message: `The text has ${plural(d.count, "exclamation mark", "exclamation marks")}${d.variant === "run" ? ", including repeated ones (\"!!\")" : ""}.`,
    fix: "Keep exclamation marks rare and never repeat them.",
  }),
  "body.hidden_text": (d) => ({
    message: `${plural(d.count, "block of text is", "blocks of text are")} hidden from readers (${d.sample}). Hidden text is a classic spam trick.`,
    fix: "Remove hidden text. A single short hidden preheader (under 150 characters) is fine.",
  }),
  "css.script": (d) => ({
    message: `The HTML contains ${plural(d.count, "script", "scripts")} (<script> or onclick-style handlers). Gmail and every mainstream client strip them, and filters treat them as hostile.`,
    fix: "Remove all JavaScript. Emails cannot run code.",
  }),
  "css.external_stylesheet": (d) => ({
    message: `${plural(d.count, "external stylesheet is", "external stylesheets are")} linked. Gmail will not load ${(d.count ?? 1) === 1 ? "it" : "them"}, so the email shows unstyled.`,
    fix: "Inline the CSS or put it in a <style> block in the email itself.",
  }),
  "css.import": () => ({
    message: "The CSS uses @import, which many email clients ignore.",
    fix: "Inline the imported CSS instead.",
  }),
  "css.layout_unsupported": (d) => ({
    message: `The layout uses CSS that Outlook on Windows ignores (${d.sample}), so it will look broken there.`,
    fix: "Build the layout with tables, or provide an Outlook-specific fallback.",
  }),
  "css.background_image": () => ({
    message: "CSS background images will not show in Outlook on Windows.",
    fix: "Set a background colour as a fallback, and make sure the text is readable without the image.",
  }),
  "html.form": () => ({
    message: "The email contains a form. Many clients disable or remove forms.",
    fix: "Link to a form on your website instead.",
  }),
  "html.embed": (d) => ({
    message: `The email embeds content that most clients strip (${d.sample}).`,
    fix: "Use a linked thumbnail image that opens the content on the web.",
  }),
  "svg.inline": () => ({
    message: "The email uses inline SVG, which Gmail does not display.",
    fix: "Export the graphic as PNG and reference it with <img>.",
  }),
  "images.base64": (d) => ({
    message: `${plural(d.count, "image is", "images are")} embedded as data: URIs. Gmail does not show them and they make the email much larger.`,
    fix: "Host the images and link to them with https:// URLs.",
  }),
  "bulk.no_unsubscribe": () => ({
    message: "This bulk email has no way to unsubscribe: no List-Unsubscribe header and no unsubscribe link.",
    fix: "Add a List-Unsubscribe header (with one-click) and a visible unsubscribe link in the footer.",
  }),
  "bulk.no_one_click": (d) => ({
    message: d.variant === "no-header"
      ? "There is an unsubscribe link but no List-Unsubscribe header, so one-click unsubscribe (required by Gmail and Yahoo for bulk senders) is missing."
      : "The List-Unsubscribe header does not support one-click unsubscribe, which Gmail and Yahoo require for bulk senders.",
    fix: "Send List-Unsubscribe with an https:// URL plus \"List-Unsubscribe-Post: List-Unsubscribe=One-Click\" (RFC 8058).",
  }),
  "bulk.no_postal_address": () => ({
    message: "No postal address was found in the email.",
    fix: "Add your organisation's physical mailing address to the footer.",
  }),
  "from.noreply": () => ({
    message: "The From address is a no-reply address, so readers cannot answer you.",
    fix: "Send from an address that accepts replies.",
  }),
  "preheader.missing": () => ({
    message: "There is no preview text, so the inbox will show whatever text happens to come first.",
    fix: "Add a short preheader (around one sentence) that complements the subject.",
  }),
  "html.malformed": (d) => ({
    message: `The HTML has ${plural(d.count, "unclosed or stray tag", "unclosed or stray tags")} (${d.sample}). Email clients repair broken HTML in different ways.`,
    fix: "Close every tag you open, and remove extra closing tags.",
  }),
};

/** Nepali messages for the most important rules. Anything missing falls back to English. */
const NE: Partial<Record<RuleId, Msg>> = {
  "html.too_large": (d) => ({
    message: `HTML ${d.n}KB छ। Gmail ले करिब 102KB भन्दा ठूलो इमेल काटेर देखाउँछ, त्यसैले इमेलको अन्तिम भाग (प्रायः अनसब्स्क्राइब लिङ्क) लुक्न सक्छ।`,
    fix: "प्रयोग नभएको CSS, comment र दोहोरिएका inline style हटाएर HTML सानो बनाउनुहोस्।",
  }),
  "attachment.risky_type": (d) => ({
    message: `${d.count ?? 1} वटा attachment मेल प्रदायकहरूले प्रायः रोक्ने प्रकारको छ (${d.sample})।`,
    fix: "फाइल डाउनलोड लिङ्कबाट पठाउनुहोस्, वा सुरक्षित ढाँचा (जस्तै PDF) प्रयोग गर्नुहोस्।",
  }),
  "images.only": () => ({
    message: "यो इमेल लगभग पूरै तस्बिर मात्र छ। तस्बिर बन्द हुँदा खाली देखिन्छ, र यस्तो इमेल स्प्याममा पर्ने सम्भावना बढी हुन्छ।",
    fix: "मुख्य सन्देश र बटन वास्तविक पाठ (text) मा लेख्नुहोस्।",
  }),
  "links.text_mismatch": (d) => ({
    message: `${d.count ?? 1} वटा लिङ्कमा देखिने ठेगाना एउटा छ तर लिङ्क अर्कै ठाउँमा जान्छ (${d.sample})। यसलाई फिसिङ मानिन्छ।`,
    fix: "देखिने पाठ र वास्तविक गन्तव्य मिलाउनुहोस्, वा URL को सट्टा वर्णनात्मक शब्द प्रयोग गर्नुहोस्।",
  }),
  "subject.missing": () => ({
    message: "विषय (subject) खाली छ।",
    fix: "इमेलभित्र के छ भन्ने छोटो र स्पष्ट विषय लेख्नुहोस्।",
  }),
  "subject.spammy": (d) => ({
    message: `विषयमा स्प्याम जस्तो शब्द छ: ${d.sample}।`,
    fix: "सामग्रीलाई सीधा र स्पष्ट भाषामा वर्णन गर्नुहोस्।",
  }),
  "body.spammy_phrases": (d) => ({
    message: `पाठमा ${d.count ?? 1} वटा स्प्याम जस्ता वाक्यांश छन्: ${d.sample}।`,
    fix: "ती वाक्यहरू सरल र स्पष्ट भाषामा फेरि लेख्नुहोस्।",
  }),
  "css.script": () => ({
    message: "HTML मा script छ। Gmail लगायत सबै प्रमुख इमेल एपले यसलाई हटाउँछन्, र स्प्याम फिल्टरले खतरनाक मान्छन्।",
    fix: "सबै JavaScript हटाउनुहोस्।",
  }),
  "bulk.no_unsubscribe": () => ({
    message: "यो बल्क इमेलमा अनसब्स्क्राइब गर्ने उपाय छैन: List-Unsubscribe हेडर पनि छैन, अनसब्स्क्राइब लिङ्क पनि छैन।",
    fix: "One-click सहितको List-Unsubscribe हेडर र फुटरमा देखिने अनसब्स्क्राइब लिङ्क थप्नुहोस्।",
  }),
  "bulk.no_one_click": () => ({
    message: "One-click अनसब्स्क्राइब छैन। Gmail र Yahoo ले बल्क पठाउनेहरूका लागि यो अनिवार्य गरेका छन्।",
    fix: "https:// URL सहितको List-Unsubscribe र \"List-Unsubscribe-Post: List-Unsubscribe=One-Click\" हेडर पठाउनुहोस् (RFC 8058)।",
  }),
};

export function messageFor(id: RuleId, d: Detail, locale: Locale | undefined): Text {
  const ne = locale === "ne" ? NE[id] : undefined;
  return (ne ?? EN[id])(d);
}
