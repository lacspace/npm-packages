/** Normalise schema.org JSON-LD / microdata objects into Extraction records. */

import { parseAmount } from "./money";
import type { Extraction, ExtractType } from "./types";

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function arr(v: unknown): unknown[] {
  return v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];
}

/** Last segment of @type ("http://schema.org/Order" → "Order"); first type if an array. */
export function typeOf(o: Obj): string {
  const t = arr(o["@type"])[0];
  return typeof t === "string" ? t.replace(/^.*[/#:]/, "") : "";
}

function str(v: unknown): string | undefined {
  if (typeof v === "string") {
    const s = v.replace(/\s+/g, " ").trim();
    return s || undefined;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (isObj(v)) return str(v["@value"]) ?? str(v["name"]) ?? str(v["@id"]);
  if (Array.isArray(v)) return str(v[0]);
  return undefined;
}

function name(v: unknown): string | undefined {
  if (isObj(v)) return str(v["name"]) ?? str(v["legalName"]);
  return str(v);
}

function money(amount: unknown, currency: unknown): { amount: number; currency?: string } | undefined {
  if (isObj(amount)) {
    // PriceSpecification / MonetaryAmount
    return money(amount["price"] ?? amount["value"], amount["priceCurrency"] ?? amount["currency"] ?? currency);
  }
  const a = parseAmount(amount);
  if (a === null) return undefined;
  const c = str(currency);
  return c ? { amount: a, currency: c.toUpperCase() } : { amount: a };
}

function addressString(addr: unknown): string | undefined {
  if (!isObj(addr)) return str(addr);
  const parts = [addr["streetAddress"], addr["addressLocality"], addr["addressRegion"], addr["postalCode"], name(addr["addressCountry"])]
    .map(str)
    .filter(Boolean);
  return parts.length ? parts.join(", ") : str(addr["name"]);
}

function place(v: unknown): Obj | undefined {
  if (!isObj(v)) return str(v) ? { name: str(v) } : undefined;
  const out: Obj = {};
  const n = str(v["name"]);
  if (n) out["name"] = n;
  const code = str(v["iataCode"]);
  if (code) out["code"] = code;
  const addr = addressString(v["address"]);
  if (addr) out["address"] = addr;
  return Object.keys(out).length ? out : undefined;
}

function clean(o: Obj): Obj {
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) delete o[k];
  }
  return o;
}

function items(o: Obj): Obj[] {
  const out: Obj[] = [];
  for (const offer of arr(o["acceptedOffer"] ?? o["orderedItem"] ?? o["itemShipped"] ?? o["referencesOrder"])) {
    if (!isObj(offer)) continue;
    const thing = isObj(offer["itemOffered"]) ? offer["itemOffered"] : isObj(offer["orderedItem"]) ? offer["orderedItem"] : offer;
    const qty = isObj(offer["eligibleQuantity"]) ? offer["eligibleQuantity"]["value"] : (offer["orderQuantity"] ?? offer["eligibleQuantity"]);
    const price = money(offer["price"] ?? offer["priceSpecification"], offer["priceCurrency"]);
    const it = clean({ name: name(thing), sku: str((thing as Obj)["sku"]), quantity: parseAmount(qty) ?? undefined, price });
    if (Object.keys(it).length) out.push(it);
  }
  return out;
}

function order(o: Obj): Obj {
  return clean({
    orderNumber: str(o["orderNumber"]) ?? str(o["confirmationNumber"]),
    merchant: name(o["seller"] ?? o["merchant"] ?? o["broker"]),
    total: money(o["price"] ?? o["totalPrice"] ?? o["totalPaymentDue"], o["priceCurrency"]),
    status: str(o["orderStatus"])?.replace(/^.*\//, ""),
    orderDate: str(o["orderDate"]),
    paymentMethod: name(o["paymentMethod"])?.replace(/^.*\//, ""),
    url: str(o["url"]) ?? str(o["orderUrl"]),
    items: items(o),
    customer: name(o["customer"]),
  });
}

function flight(o: Obj): Obj {
  const flights: Obj[] = [];
  for (const f of arr(o["reservationFor"])) {
    if (!isObj(f)) continue;
    const airline = isObj(f["airline"]) ? f["airline"] : undefined;
    const code = str(airline?.["iataCode"]);
    const num = str(f["flightNumber"]);
    const full = num ? (code && !num.toUpperCase().startsWith(code.toUpperCase()) ? `${code}${num}` : num) : undefined;
    flights.push(
      clean({
        flightNumber: full?.replace(/\s+/g, ""),
        airline: name(airline),
        from: place(f["departureAirport"]),
        to: place(f["arrivalAirport"]),
        departureTime: str(f["departureTime"]),
        arrivalTime: str(f["arrivalTime"]),
        gate: str(f["departureGate"]),
        terminal: str(f["departureTerminal"]),
      }),
    );
  }
  return clean({
    reservationNumber: str(o["reservationNumber"]),
    passenger: name(o["underName"]),
    flights,
    seat: str(isObj(o["reservedTicket"]) ? (o["reservedTicket"] as Obj)["ticketedSeat"] : undefined),
    ticketNumber: str(isObj(o["reservedTicket"]) ? (o["reservedTicket"] as Obj)["ticketNumber"] : undefined),
    total: money(o["totalPrice"] ?? o["price"], o["priceCurrency"]),
    status: str(o["reservationStatus"])?.replace(/^.*\//, ""),
    url: str(o["url"]),
  });
}

function reservation(o: Obj, kind: string): Obj {
  const f = isObj(o["reservationFor"]) ? (o["reservationFor"] as Obj) : {};
  return clean({
    kind,
    reservationNumber: str(o["reservationNumber"]),
    name: name(f),
    location: place(kind === "event" ? f["location"] : f),
    guest: name(o["underName"]),
    checkin: str(o["checkinTime"] ?? o["checkinDate"]),
    checkout: str(o["checkoutTime"] ?? o["checkoutDate"]),
    startTime: str(o["startTime"] ?? f["startDate"]),
    endTime: str(o["endTime"] ?? f["endDate"]),
    partySize: parseAmount(o["partySize"]) ?? undefined,
    total: money(o["totalPrice"] ?? o["price"], o["priceCurrency"]),
    status: str(o["reservationStatus"])?.replace(/^.*\//, ""),
    url: str(o["url"]),
  });
}

function parcel(o: Obj): Obj {
  const po = isObj(o["partOfOrder"]) ? (o["partOfOrder"] as Obj) : undefined;
  return clean({
    trackingNumber: str(o["trackingNumber"]),
    carrier: name(o["carrier"] ?? o["provider"]),
    trackingUrl: str(o["trackingUrl"]),
    status: str(isObj(o["deliveryStatus"]) ? (o["deliveryStatus"] as Obj)["name"] ?? (o["deliveryStatus"] as Obj)["description"] : o["deliveryStatus"])?.replace(/^.*\//, ""),
    expectedArrivalFrom: str(o["expectedArrivalFrom"]),
    expectedArrivalUntil: str(o["expectedArrivalUntil"]),
    deliveryAddress: addressString(o["deliveryAddress"]),
    orderNumber: po ? str(po["orderNumber"]) : undefined,
    merchant: po ? name(po["merchant"] ?? po["seller"]) : undefined,
    items: items(o),
  });
}

function event(o: Obj): Obj {
  return clean({
    name: str(o["name"]),
    startDate: str(o["startDate"]),
    endDate: str(o["endDate"]),
    location: place(o["location"]),
    organizer: name(o["organizer"]),
    url: str(o["url"]),
    description: str(o["description"]),
  });
}

function invoice(o: Obj): Obj {
  return clean({
    invoiceNumber: str(o["identifier"]) ?? str(o["confirmationNumber"]) ?? str(o["accountId"]),
    merchant: name(o["provider"] ?? o["broker"] ?? o["seller"]),
    total: money(o["totalPaymentDue"] ?? o["minimumPaymentDue"] ?? o["price"], o["priceCurrency"]),
    dueDate: str(o["paymentDueDate"] ?? o["paymentDue"]),
    status: str(o["paymentStatus"])?.replace(/^.*\//, ""),
    billingPeriod: str(o["billingPeriod"]),
    customer: name(o["customer"]),
    url: str(o["url"]),
    orderNumber: isObj(o["referencesOrder"]) ? str((o["referencesOrder"] as Obj)["orderNumber"]) : undefined,
  });
}

function one(o: Obj): { type: ExtractType; fields: Obj } | null {
  const t = typeOf(o);
  switch (t) {
    case "Order":
      return { type: "order", fields: order(o) };
    case "Invoice":
      return { type: "invoice", fields: invoice(o) };
    case "FlightReservation":
      return { type: "flight", fields: flight(o) };
    case "LodgingReservation":
      return { type: "reservation", fields: reservation(o, "lodging") };
    case "FoodEstablishmentReservation":
      return { type: "reservation", fields: reservation(o, "restaurant") };
    case "EventReservation":
      return { type: "reservation", fields: reservation(o, "event") };
    case "ParcelDelivery":
      return { type: "shipment", fields: parcel(o) };
    case "Event":
    case "MusicEvent":
    case "BusinessEvent":
    case "SportsEvent":
    case "TheaterEvent":
    case "EducationEvent":
    case "SocialEvent":
    case "Festival":
      return { type: "event", fields: event(o) };
    default:
      return null;
  }
}

/** Flatten @graph / arrays and normalise every supported object. */
export function normaliseStructured(values: unknown[], source: "jsonld" | "microdata"): Extraction[] {
  const out: Extraction[] = [];
  const seen = new Set<unknown>();
  const visit = (v: unknown, depth: number) => {
    if (depth > 6 || seen.has(v)) return;
    if (Array.isArray(v)) {
      for (const x of v) visit(x, depth + 1);
      return;
    }
    if (!isObj(v)) return;
    seen.add(v);
    if (Array.isArray(v["@graph"])) visit(v["@graph"], depth + 1);
    const r = one(v);
    if (r && Object.keys(r.fields).length > (r.fields["kind"] ? 1 : 0)) {
      out.push({ type: r.type, fields: r.fields, confidence: source === "jsonld" ? 0.95 : 0.9, source });
    }
  };
  for (const v of values) visit(v, 0);
  return out;
}
