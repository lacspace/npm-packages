import { describe, expect, it } from "vitest";
import { currencyCode, extract, findMoney, htmlToText, merchantFrom, microdataItems, parseAmount, stripQuotedText } from "./index";
import type { Extraction } from "./index";

const byType = (r: Extraction[], t: Extraction["type"]) => r.filter((x) => x.type === t);
const one = (r: Extraction[], t: Extraction["type"]) => {
  const x = byType(r, t);
  expect(x).toHaveLength(1);
  return x[0]!;
};

const ld = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

// ───────────────────────── JSON-LD ─────────────────────────

describe("JSON-LD", () => {
  it("Order with offers, seller and total", () => {
    const html = `<html><body>${ld({
      "@context": "http://schema.org",
      "@type": "Order",
      merchant: { "@type": "Organization", name: "Daraz" },
      orderNumber: "203948571234567",
      orderStatus: "http://schema.org/OrderProcessing",
      priceCurrency: "NPR",
      price: "4,599.00",
      acceptedOffer: [
        { "@type": "Offer", itemOffered: { "@type": "Product", name: "Wireless Earbuds", sku: "EB-1" }, price: "3999", priceCurrency: "NPR", eligibleQuantity: { "@type": "QuantitativeValue", value: 1 } },
        { "@type": "Offer", itemOffered: { "@type": "Product", name: "Phone Case" }, price: "600", priceCurrency: "NPR", eligibleQuantity: { value: 1 } },
      ],
      url: "https://my.daraz.com.np/order/203948571234567",
    })}<p>Thanks!</p></body></html>`;
    const r = extract({ subject: "Your order is confirmed", html, from: "Daraz <no-reply@daraz.com.np>" });
    const o = one(r, "order");
    expect(o.source).toBe("jsonld");
    expect(o.confidence).toBe(0.95);
    expect(o.fields).toMatchObject({
      orderNumber: "203948571234567",
      merchant: "Daraz",
      total: { amount: 4599, currency: "NPR" },
      status: "OrderProcessing",
      url: "https://my.daraz.com.np/order/203948571234567",
    });
    expect(o.fields["items"]).toEqual([
      { name: "Wireless Earbuds", sku: "EB-1", quantity: 1, price: { amount: 3999, currency: "NPR" } },
      { name: "Phone Case", quantity: 1, price: { amount: 600, currency: "NPR" } },
    ]);
  });

  it("FlightReservation array becomes one result per leg", () => {
    const legs = ["601", "602"].map((n, i) => ({
      "@context": "http://schema.org",
      "@type": "FlightReservation",
      reservationNumber: "XK7P2Q",
      underName: { "@type": "Person", name: "Sita Sharma" },
      reservationFor: {
        "@type": "Flight",
        flightNumber: n,
        airline: { "@type": "Airline", name: "Buddha Air", iataCode: "U4" },
        departureAirport: { "@type": "Airport", name: "Tribhuvan Intl", iataCode: i ? "PKR" : "KTM" },
        arrivalAirport: { "@type": "Airport", name: "Pokhara Intl", iataCode: i ? "KTM" : "PKR" },
        departureTime: "2026-10-14T07:30:00+05:45",
        arrivalTime: "2026-10-14T08:00:00+05:45",
      },
    }));
    const r = extract({ subject: "E-ticket", html: ld(legs), from: "Buddha Air <tickets@buddhaair.com>" });
    const f = byType(r, "flight");
    expect(f).toHaveLength(2);
    expect(f[0]!.fields).toMatchObject({ reservationNumber: "XK7P2Q", passenger: "Sita Sharma" });
    expect((f[0]!.fields["flights"] as unknown[])[0]).toMatchObject({
      flightNumber: "U4601",
      airline: "Buddha Air",
      from: { code: "KTM" },
      to: { code: "PKR" },
      departureTime: "2026-10-14T07:30:00+05:45",
    });
  });

  it("ParcelDelivery → shipment with carrier, tracking and order", () => {
    const html = ld({
      "@context": "http://schema.org",
      "@type": "ParcelDelivery",
      carrier: { "@type": "Organization", name: "FedEx" },
      trackingNumber: "771234567890",
      trackingUrl: "https://www.fedex.com/fedextrack/?trknbr=771234567890",
      expectedArrivalUntil: "2026-10-20T18:00:00-05:00",
      deliveryAddress: { "@type": "PostalAddress", streetAddress: "1 Main St", addressLocality: "Austin" },
      partOfOrder: { "@type": "Order", orderNumber: "A-1001", merchant: { name: "Shop Co" } },
    });
    const s = one(extract({ subject: "Shipped", html }), "shipment");
    expect(s.fields).toMatchObject({
      carrier: "FedEx",
      trackingNumber: "771234567890",
      trackingUrl: "https://www.fedex.com/fedextrack/?trknbr=771234567890",
      orderNumber: "A-1001",
      merchant: "Shop Co",
      deliveryAddress: "1 Main St, Austin",
    });
  });

  it("LodgingReservation", () => {
    const html = ld({
      "@context": "http://schema.org",
      "@type": "LodgingReservation",
      reservationNumber: "H-55210",
      reservationStatus: "http://schema.org/ReservationConfirmed",
      underName: { name: "Ram Thapa" },
      reservationFor: { "@type": "LodgingBusiness", name: "Lakeside Inn", address: { streetAddress: "Lakeside", addressLocality: "Pokhara", addressCountry: "NP" } },
      checkinDate: "2026-10-14T14:00:00+05:45",
      checkoutDate: "2026-10-16T12:00:00+05:45",
    });
    const r = one(extract({ html }), "reservation");
    expect(r.fields).toMatchObject({ kind: "lodging", reservationNumber: "H-55210", name: "Lakeside Inn", guest: "Ram Thapa", status: "ReservationConfirmed" });
    expect((r.fields["location"] as { address: string }).address).toBe("Lakeside, Pokhara, NP");
  });

  it("FoodEstablishmentReservation", () => {
    const html = ld({ "@context": "http://schema.org", "@type": "FoodEstablishmentReservation", reservationNumber: "T42", partySize: "4", startTime: "2026-10-15T19:30:00+05:45", reservationFor: { "@type": "Restaurant", name: "Thamel House" } });
    expect(one(extract({ html }), "reservation").fields).toMatchObject({ kind: "restaurant", partySize: 4, name: "Thamel House" });
  });

  it("EventReservation and Event", () => {
    const html =
      ld({ "@context": "http://schema.org", "@type": "EventReservation", reservationNumber: "E-9", reservationFor: { "@type": "Event", name: "Tech Summit", startDate: "2026-11-01T09:00:00+05:45", location: { "@type": "Place", name: "Hyatt Regency", address: "Taragaon, Kathmandu" } } }) +
      ld({ "@context": "http://schema.org", "@type": "MusicEvent", name: "Jazzmandu", startDate: "2026-10-30", location: { name: "Patan Durbar Square" } });
    const r = extract({ html });
    expect(one(r, "reservation").fields).toMatchObject({ kind: "event", name: "Tech Summit", startTime: "2026-11-01T09:00:00+05:45", location: { name: "Hyatt Regency", address: "Taragaon, Kathmandu" } });
    expect(one(r, "event").fields).toMatchObject({ name: "Jazzmandu", startDate: "2026-10-30", location: { name: "Patan Durbar Square" } });
  });

  it("Invoice with totalPaymentDue", () => {
    const html = ld({
      "@context": "http://schema.org",
      "@type": "Invoice",
      identifier: "INV-2026-0042",
      provider: { name: "Lacspace" },
      totalPaymentDue: { "@type": "PriceSpecification", price: 12500, priceCurrency: "NPR" },
      paymentDueDate: "2026-10-30",
      paymentStatus: "http://schema.org/PaymentDue",
    });
    expect(one(extract({ html }), "invoice").fields).toMatchObject({ invoiceNumber: "INV-2026-0042", merchant: "Lacspace", total: { amount: 12500, currency: "NPR" }, dueDate: "2026-10-30", status: "PaymentDue" });
  });

  it("@graph wrappers and https schema types", () => {
    const html = ld({ "@context": "https://schema.org", "@graph": [{ "@type": "https://schema.org/Order", orderNumber: "G-1" }, { "@type": "WebPage", name: "x" }] });
    expect(one(extract({ html }), "order").fields["orderNumber"]).toBe("G-1");
  });

  it("invalid JSON-LD is skipped without throwing", () => {
    const html = `<script type="application/ld+json">{ "@type": "Order", orderNumber: </script><p>hi</p>`;
    expect(extract({ html })).toEqual([]);
  });

  it("JSON-LD order suppresses heuristic order", () => {
    const html = ld({ "@type": "Order", orderNumber: "X-77", price: 10, priceCurrency: "USD" }) + "<p>Order #X-77</p><p>Total: $10.00</p>";
    const r = extract({ subject: "Order confirmed", html });
    expect(byType(r, "order")).toHaveLength(1);
    expect(r[0]!.source).toBe("jsonld");
  });
});

describe("microdata", () => {
  const html = `<div itemscope itemtype="http://schema.org/ParcelDelivery">
    <div itemprop="carrier" itemscope itemtype="http://schema.org/Organization"><meta itemprop="name" content="DHL"/></div>
    <span itemprop="trackingNumber">1234567890</span>
    <link itemprop="trackingUrl" href="https://www.dhl.com/track?id=1234567890"/>
    <div itemprop="partOfOrder" itemscope itemtype="http://schema.org/Order"><span itemprop="orderNumber">ORD-55</span></div>
  </div>`;

  it("parses nested microdata items", () => {
    const items = microdataItems(html);
    expect(items[0]).toMatchObject({ "@type": "ParcelDelivery", trackingNumber: "1234567890", carrier: { "@type": "Organization", name: "DHL" } });
  });

  it("microdata shipment normalised with 0.9 confidence", () => {
    const s = one(extract({ html }), "shipment");
    expect(s.source).toBe("microdata");
    expect(s.confidence).toBe(0.9);
    expect(s.fields).toMatchObject({ carrier: "DHL", trackingNumber: "1234567890", trackingUrl: "https://www.dhl.com/track?id=1234567890", orderNumber: "ORD-55" });
  });
});

// ───────────────────────── OTP ─────────────────────────

describe("OTP", () => {
  it("bank OTP in English with expiry", () => {
    const r = extract({
      subject: "One Time Password for your transaction",
      text: "Dear Customer,\nYour OTP for the transaction of NPR 15,000.00 at DARAZ on 07-10-2026 is 482913. It is valid for 5 minutes. Do not share it with anyone.\nCall 01-5970000 for help.\nNabil Bank",
      from: "Nabil Bank <alerts@nabilbank.com>",
    });
    const o = one(r, "otp");
    expect(o.fields).toEqual({ code: "482913", expiresInMinutes: 5 });
    expect(o.confidence).toBe(0.9);
  });

  it("Nepali bank OTP with Devanagari digits", () => {
    const r = extract({ subject: "ओटीपी", text: "तपाईंको ओटीपी कोड ५७२९१८ हो। यो कोड १० मिनेटसम्म मान्य छ। कसैलाई नदिनुहोस्।", from: "Global IME Bank <noreply@gibl.com.np>" });
    expect(one(r, "otp").fields).toEqual({ code: "572918", expiresInMinutes: 10 });
  });

  it("Nepali पासकोड with ASCII digits", () => {
    const r = extract({ subject: "Login", text: "तपाईंको लगइन पासकोड: 9031 हो।" });
    expect(one(r, "otp").fields["code"]).toBe("9031");
  });

  it("code before keyword ('123456 is your verification code')", () => {
    const r = extract({ subject: "123456 is your verification code", text: "Use it to sign in." });
    expect(one(r, "otp").fields["code"]).toBe("123456");
  });

  it("big-number layout: code alone on the next line (HTML)", () => {
    const html = `<table><tr><td>Your verification code</td></tr><tr><td style="font-size:32px"><b>739104</b></td></tr><tr><td>This code expires in 10 minutes.</td></tr></table>`;
    const r = extract({ subject: "Verify your email", html });
    expect(one(r, "otp").fields).toEqual({ code: "739104", expiresInMinutes: 10 });
  });

  it("split code '481 552'", () => {
    const r = extract({ subject: "Security code", text: "Your security code is:\n481 552\n" });
    expect(one(r, "otp").fields["code"]).toBe("481552");
  });

  it("ignores masked account numbers, amounts and phone numbers", () => {
    const r = extract({ subject: "Account alert", text: "Your A/C XXXX4521 has been debited by Rs. 2500 on 2026-10-07. Verification of KYC pending. Call 9801234567." });
    expect(byType(r, "otp")).toHaveLength(0);
  });

  it("ignores years in promo text with 'code'", () => {
    const r = extract({ subject: "Dashain Sale 2026", text: "Biggest sale of 2026! Use code DASHAIN2026 to save Rs. 500 on orders above Rs. 3000." });
    expect(byType(r, "otp")).toHaveLength(0);
  });

  it("ignores postal codes", () => {
    const r = extract({ subject: "Address updated", text: "New address: Lalitpur, Postal code 44700" });
    expect(byType(r, "otp")).toHaveLength(0);
  });

  it("accepts a year-like code directly after the keyword", () => {
    const r = extract({ subject: "Your OTP", text: "Your OTP is 2024." });
    expect(one(r, "otp").fields["code"]).toBe("2024");
  });

  it("expiry in hours", () => {
    const r = extract({ subject: "Code", text: "Your login code is 88231945. It expires in 1 hour." });
    expect(one(r, "otp").fields).toEqual({ code: "88231945", expiresInMinutes: 60 });
  });
});

// ───────────────────────── commerce ─────────────────────────

describe("orders, receipts, invoices", () => {
  it("Daraz-style order (HTML, no JSON-LD)", () => {
    const html = `<html><body>
      <h1>Thank you for your order!</h1>
      <p>Hi Sita, your order #208471923456 has been placed on 05 Oct 2026.</p>
      <table>
        <tr><td>Wireless Earbuds x1</td><td>Rs. 3,999</td></tr>
        <tr><td>Subtotal</td><td>Rs. 3,999</td></tr>
        <tr><td>Shipping Fee</td><td>Rs. 100</td></tr>
        <tr><td>Total</td><td>Rs. 4,099</td></tr>
      </table></body></html>`;
    const o = one(extract({ subject: "Your Daraz order #208471923456 has been confirmed", html, from: "Daraz <no-reply@daraz.com.np>" }), "order");
    expect(o.source).toBe("heuristic");
    expect(o.confidence).toBeLessThan(0.95);
    expect(o.fields).toMatchObject({ orderNumber: "208471923456", total: { amount: 4099, currency: "NPR" }, merchant: "Daraz", date: "2026-10-05" });
  });

  it("eSewa-style receipt", () => {
    const text = `Payment Successful
Dear Customer, you have successfully paid NPR 1,250.00 to Nepal Telecom.
Transaction Code: 0AB9C7D
Reference ID: 72910
Amount: NPR 1,250.00
Service Charge: NPR 0.00
Date: 2026-10-06 14:22`;
    const r = one(extract({ subject: "eSewa: Payment Successful", text, from: "eSewa <noreply@esewa.com.np>" }), "receipt");
    expect(r.fields).toMatchObject({ transactionId: "0AB9C7D", total: { amount: 1250, currency: "NPR" }, merchant: "eSewa", date: "2026-10-06" });
  });

  it("Khalti-style receipt with रु. and Nepali total label", () => {
    const text = "भुक्तानी सफल भयो।\nकारोबार नं / Transaction ID: KH8823XQ1\nजम्मा रकम: रु. ५००\nधन्यवाद, Khalti";
    const r = one(extract({ subject: "भुक्तानी सफल", text, from: "Khalti <no-reply@khalti.com>" }), "receipt");
    expect(r.fields).toMatchObject({ transactionId: "KH8823XQ1", total: { amount: 500, currency: "NPR" }, merchant: "Khalti" });
  });

  it("invoice with number, grand total and due date", () => {
    const text = `Invoice No: INV-0042
Bill to: Acme Pvt. Ltd.
Hosting (12 months)   $120.00
Subtotal $120.00
VAT $15.60
Grand Total $135.60
Due date: 30 Oct 2026`;
    const r = one(extract({ subject: "Invoice INV-0042 from Lacspace", text, from: "Lacspace Billing <billing@lacspace.com>" }), "invoice");
    expect(r.fields).toMatchObject({ invoiceNumber: "INV-0042", total: { amount: 135.6, currency: "USD" }, dueDate: "2026-10-30", merchant: "Lacspace Billing" });
  });

  it("INR rupee symbol", () => {
    const r = one(extract({ subject: "Order confirmed", text: "Order ID: OD12345678\nOrder Total: ₹1,49,999.00" }), "order");
    expect(r.fields["total"]).toEqual({ amount: 149999, currency: "INR" });
  });

  it("rupee option makes bare Rs. INR", () => {
    const r = one(extract({ subject: "Order confirmed", text: "Order ID: OD12345678\nTotal: Rs. 499", rupee: "INR" }), "order");
    expect(r.fields["total"]).toEqual({ amount: 499, currency: "INR" });
  });

  it("euro and pound totals", () => {
    expect(one(extract({ subject: "Your receipt", text: "Receipt #: 88-1932\nTotal paid: €42.50" }), "receipt").fields["total"]).toEqual({ amount: 42.5, currency: "EUR" });
    expect(one(extract({ subject: "Your receipt", text: "Receipt No: 77120\nTotal: £9.99" }), "receipt").fields["total"]).toEqual({ amount: 9.99, currency: "GBP" });
  });

  it("total on the line after its label", () => {
    const r = one(extract({ subject: "Your order", text: "Order #A12345\nTotal\nNPR 2,300" }), "order");
    expect(r.fields["total"]).toEqual({ amount: 2300, currency: "NPR" });
  });

  it("newsletter with years and prices yields nothing", () => {
    const html = `<h1>New arrivals for 2026</h1><p>Phones from Rs. 14,999. Laptops from $799. Save up to 40% off.</p><p>Shop the 2025 clearance – total savings up to Rs. 5,000!</p><p>Order now and get free delivery.</p><a href="https://shop.example.com/unsubscribe">Unsubscribe</a>`;
    expect(extract({ subject: "Big Dashain Sale 2026 – up to 40% off", html, from: "Shop <news@shop.example.com>" })).toEqual([]);
  });

  it("price list without labels is not an order", () => {
    expect(extract({ subject: "Weekly deals", text: "Rice 25kg Rs. 2,450\nOil 1L Rs. 310\nSugar Rs. 120" })).toEqual([]);
  });
});

// ───────────────────────── shipments ─────────────────────────

describe("shipments", () => {
  it("UPS 1Z tracking number with link", () => {
    const html = `<p>Your package is on its way.</p><p>Tracking Number: 1Z999AA10123456784</p><a href="https://www.ups.com/track?tracknum=1Z999AA10123456784">Track package</a>`;
    const s = one(extract({ subject: "Your order has shipped", html, from: "Shop <orders@shop.example.com>" }), "shipment");
    expect(s.fields).toMatchObject({ trackingNumber: "1Z999AA10123456784", carrier: "UPS", trackingUrl: "https://www.ups.com/track?tracknum=1Z999AA10123456784", status: "in-transit" });
    expect(s.confidence).toBe(0.85);
  });

  it("local courier with labelled tracking number", () => {
    const text = "Namaste! Your parcel for order #208471923456 has been dispatched via Pathao.\nTracking ID: PTH-88234519\nTrack here: https://pathao.example/track/PTH-88234519\nExpected delivery: 2-3 days.";
    const r = extract({ subject: "Your parcel is out", text, from: "Daraz <no-reply@daraz.com.np>" });
    const s = one(r, "shipment");
    expect(s.fields).toMatchObject({ trackingNumber: "PTH-88234519", carrier: "Pathao", trackingUrl: "https://pathao.example/track/PTH-88234519", orderNumber: "208471923456", status: "in-transit" });
    expect(byType(r, "order")).toHaveLength(0);
  });

  it("out for delivery status, DHL AWB", () => {
    const s = one(extract({ subject: "Out for delivery", text: "Your DHL shipment AWB: 4829105736 is out for delivery today." }), "shipment");
    expect(s.fields).toMatchObject({ trackingNumber: "4829105736", carrier: "DHL", status: "out-for-delivery" });
  });

  it("no carrier is guessed when none is named", () => {
    const s = one(extract({ subject: "Shipped", text: "Tracking number: ZX99001122" }), "shipment");
    expect(s.fields["carrier"]).toBeUndefined();
  });
});

// ───────────────────────── flights ─────────────────────────

describe("flights", () => {
  it("airline e-ticket text", () => {
    const text = `E-Ticket Itinerary
Booking Reference (PNR): QX7TZ2
Passenger: MR RAM THAPA
Flight: U4 601   KTM → PKR
Departure: 14 Oct 2026 07:30
Flight: U4 602   PKR → KTM
Departure: 16 Oct 2026 16:15
Total fare: NPR 9,800`;
    const f = one(extract({ subject: "Your e-ticket – Buddha Air", text, from: "Buddha Air <tickets@buddhaair.com>" }), "flight");
    expect(f.fields["reservationNumber"]).toBe("QX7TZ2");
    expect(f.fields["flights"]).toEqual([
      { flightNumber: "U4601", airlineCode: "U4", number: "601", date: "2026-10-14", time: "07:30", from: "KTM", to: "PKR" },
      { flightNumber: "U4602", airlineCode: "U4", number: "602", date: "2026-10-16", time: "16:15", from: "PKR", to: "KTM" },
    ]);
  });

  it("international e-ticket with month-first dates", () => {
    const text = "Your flight QR 647 departs Kathmandu (KTM) on Oct 20, 2026 at 9:45 PM.\nConfirmation code: ABC123";
    const f = one(extract({ subject: "Booking confirmation", text }), "flight");
    expect((f.fields["flights"] as unknown[])[0]).toMatchObject({ flightNumber: "QR647", date: "2026-10-20", time: "21:45" });
    expect(f.fields["reservationNumber"]).toBe("ABC123");
  });

  it("no flight context → no flight", () => {
    expect(byType(extract({ subject: "Meeting", text: "See you at 10 AM 12 people. Room B2 101." }), "flight")).toHaveLength(0);
  });

  it("ignores AM/PM and Q-quarters", () => {
    const r = extract({ subject: "Flight update", text: "Departure moved to AM 10 slot. Q2 2026 schedule published." });
    expect(byType(r, "flight")).toHaveLength(0);
  });
});

// ───────────────────────── quoted replies ─────────────────────────

describe("quoted replies are ignored", () => {
  it("'On … wrote:' text", () => {
    const text = "Thanks, received!\n\nOn Mon, 6 Oct 2026 at 10:00, Bank <alerts@bank.example> wrote:\n> Your OTP is 482913\n> Order #99887766 Total: Rs. 500";
    expect(extract({ subject: "Re: OTP", text })).toEqual([]);
  });

  it("'>' quoted lines only", () => {
    expect(extract({ subject: "Re: code", text: "ok\n> Your verification code is 123456" })).toEqual([]);
  });

  it("two-line 'On … wrote:' header", () => {
    const text = "Sounds good.\nOn Mon, Oct 6, 2026 at 10:00 AM Sita Sharma\n<sita@example.com> wrote:\nYour OTP is 551122";
    expect(extract({ subject: "Re: hi", text })).toEqual([]);
  });

  it("Gmail HTML quote (gmail_quote) incl. JSON-LD inside it", () => {
    const html = `<div>Forwarding for records</div><div class="gmail_quote"><div class="gmail_attr">On Mon, Oct 6 wrote:</div><blockquote class="gmail_quote">${ld({ "@type": "Order", orderNumber: "Q-1" })}Your OTP is 778899</blockquote></div>`;
    expect(extract({ subject: "Re: order", html })).toEqual([]);
  });

  it("Apple Mail blockquote type=cite", () => {
    const html = `<div>Got it</div><blockquote type="cite"><div>Tracking Number: 1Z999AA10123456784</div></blockquote>`;
    expect(extract({ subject: "Re: shipped", html })).toEqual([]);
  });

  it("content above the quote is still extracted", () => {
    const text = "Your new verification code is 334455.\n\nOn Mon, 6 Oct 2026, Support wrote:\n> Your old code is 111222";
    expect(one(extract({ subject: "Re: code", text }), "otp").fields["code"]).toBe("334455");
  });

  it("Outlook Original Message marker", () => {
    expect(extract({ subject: "RE: invoice", text: "Paid.\n-----Original Message-----\nInvoice No: INV-9\nTotal $5" })).toEqual([]);
  });
});

// ───────────────────────── helpers & robustness ─────────────────────────

describe("helpers", () => {
  it("parseAmount handles Indian grouping, EU format, Devanagari", () => {
    expect(parseAmount("1,23,456.50")).toBe(123456.5);
    expect(parseAmount("1.234,50")).toBe(1234.5);
    expect(parseAmount("१,२५०")).toBe(1250);
    expect(parseAmount("abc")).toBeNull();
  });

  it("currencyCode", () => {
    expect(currencyCode("रु.")).toBe("NPR");
    expect(currencyCode("Rs.")).toBe("NPR");
    expect(currencyCode("Rs", "INR")).toBe("INR");
    expect(currencyCode("₹")).toBe("INR");
    expect(currencyCode("$")).toBe("USD");
  });

  it("findMoney finds symbol-first and code-after forms", () => {
    expect(findMoney("Paid Rs.1,200 and 300 USD").map((m) => [m.amount, m.currency])).toEqual([
      [1200, "NPR"],
      [300, "USD"],
    ]);
  });

  it("merchantFrom uses display name, else domain", () => {
    expect(merchantFrom("Daraz <no-reply@daraz.com.np>")).toBe("Daraz");
    expect(merchantFrom("no-reply@esewa.com.np")).toBe("Esewa");
    expect(merchantFrom('"noreply" <x@mail.khalti.com>')).toBe("Khalti");
  });

  it("htmlToText keeps table rows on one line", () => {
    expect(htmlToText("<table><tr><td>Total</td><td>Rs. 5</td></tr></table>")).toBe("Total Rs. 5");
  });

  it("stripQuotedText keeps unquoted text", () => {
    expect(stripQuotedText("a\n> b\nc")).toBe("a\nc");
  });

  it("never throws on junk", () => {
    expect(extract(undefined as never)).toEqual([]);
    expect(extract({} as never)).toEqual([]);
    expect(extract({ subject: 5 as never, html: {} as never, text: null as never, from: [] as never })).toEqual([]);
    expect(extract({ html: "<<<>>><a href=" + "x".repeat(10000) })).toEqual([]);
  });
});
