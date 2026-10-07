/**
 * @lacspace/mail-extract — structured data from email bodies: schema.org
 * JSON-LD / microdata first, then text heuristics (OTP, orders, invoices,
 * receipts, shipments, flights). Quoted replies are ignored. Zero
 * dependencies, isomorphic.
 */

import { findCommerce, findFlights, findOtp, findShipment } from "./heuristics";
import type { HeuristicContext } from "./heuristics";
import { anchors, htmlToText, jsonLdBlocks, microdataItems, stripQuotedHtml, stripQuotedText } from "./html";
import { normaliseStructured } from "./jsonld";
import type { Extraction, ExtractInput } from "./types";

export type { Extraction, ExtractInput, ExtractType } from "./types";
export { htmlToText, stripQuotedHtml, stripQuotedText, jsonLdBlocks, microdataItems } from "./html";
export { normaliseStructured } from "./jsonld";
export { findOtp, findCommerce, findShipment, findFlights, findTotal, merchantFrom } from "./heuristics";
export { parseAmount, findMoney, currencyCode, asciiDigits } from "./money";
export type { Money } from "./money";

function s(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Extract structured records from one email. Never throws; returns [] when nothing is found. */
export function extract(input: ExtractInput): Extraction[] {
  try {
    return run(input);
  } catch {
    return [];
  }
}

function run(input: ExtractInput): Extraction[] {
  if (!input || typeof input !== "object") return [];
  const subject = s(input.subject).replace(/\s+/g, " ").trim();
  const from = s(input.from);
  const rupee = input.rupee === "INR" ? "INR" : "NPR";
  const html = s(input.html) ? stripQuotedHtml(s(input.html)) : "";

  const structured: Extraction[] = [];
  if (html) {
    structured.push(...normaliseStructured(jsonLdBlocks(html), "jsonld"));
    if (/\bitemscope\b/i.test(html)) structured.push(...normaliseStructured(microdataItems(html), "microdata"));
  }

  let body = html ? htmlToText(html) : "";
  if (body.replace(/\s/g, "").length < 20 && s(input.text)) body = s(input.text);
  body = stripQuotedText(body, subject);

  const ctx: HeuristicContext = { subject, body, from, anchors: html ? anchors(html) : [], rupee };
  const has = (t: Extraction["type"]) => structured.some((x) => x.type === t);
  const out: Extraction[] = [...dedupeStructured(structured)];

  const otp = findOtp(ctx);
  if (otp) out.push(otp);
  const ship = has("shipment") ? null : findShipment(ctx);
  if (ship) out.push(ship);
  if (!has("order") && !has("invoice")) {
    const c = findCommerce(ctx);
    // A courier email that only mentions the order number is a shipment, not a new order.
    if (c && !(ship && !c.fields["total"])) out.push(c);
  }
  if (!has("flight")) {
    const f = findFlights(ctx);
    if (f) out.push(f);
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

/** Microdata often duplicates JSON-LD in the same email; drop a microdata record when JSON-LD already has the same thing. */
function dedupeStructured(list: Extraction[]): Extraction[] {
  const id = (e: Extraction) =>
    e.type + "|" + String(e.fields["orderNumber"] ?? e.fields["reservationNumber"] ?? e.fields["trackingNumber"] ?? e.fields["invoiceNumber"] ?? e.fields["name"] ?? "");
  const ldKeys = new Set(list.filter((e) => e.source === "jsonld").map(id));
  return list.filter((e) => e.source === "jsonld" || !ldKeys.has(id(e)));
}
