# @lacspace/mail-extract

Pull structured data out of email bodies: orders, invoices, receipts, flights, one-time codes, shipments, reservations and events. A webmail client can then show a "Copy code" button, a parcel tracker or a flight card.

It works in two passes:
1. **Structured data first.** It reads schema.org JSON-LD (`<script type="application/ld+json">`) and basic microdata (`itemscope` / `itemprop`) and turns them into the same set of fields.
2. **Text heuristics second.** These find OTP codes (English and Nepali), order, invoice and transaction numbers with totals (NPR / Rs. / रु., INR ₹, $, €, £), tracking numbers and flight codes with dates.

**Quoted replies are ignored.** Nothing is returned from lines starting with `>`, from text after "On … wrote:" or "-----Original Message-----", or from Gmail, Apple Mail, Outlook, Yahoo and Thunderbird quote blocks.

It has no dependencies, needs no network and runs anywhere: Node 18+, Deno, Bun, workers and browsers.

## Example

```ts
import { extract } from "@lacspace/mail-extract";

extract({
  subject: "One Time Password for your transaction",
  text: "Your OTP for the transaction of NPR 15,000.00 is 482913. It is valid for 5 minutes.",
  from: "Nabil Bank <alerts@nabilbank.com>",
});
// [{ type: "otp", fields: { code: "482913", expiresInMinutes: 5 }, confidence: 0.9, source: "heuristic" }]

extract({ subject: "Your Daraz order #208471923456 has been confirmed", html, from: "Daraz <no-reply@daraz.com.np>" });
// [{ type: "order", fields: { orderNumber: "208471923456", total: { amount: 4099, currency: "NPR" },
//    merchant: "Daraz", date: "2026-10-05" }, confidence: 0.75, source: "heuristic" }]
```

## `extract({ subject, html?, text?, from, rupee? })`

Returns `Array<{ type, fields, confidence, source }>`, sorted by confidence, highest first. It returns `[]` when nothing is found and never throws.

- `html` is preferred when given. `text` is used when there is no HTML, or when the HTML has almost no text.
- `rupee` says what a bare "Rs." means: `"NPR"` (the default) or `"INR"`. `रु.`, `NPR` and `NRs` are always NPR; `₹` and `INR` are always INR.

### From JSON-LD and microdata

JSON-LD results have confidence 0.95; microdata results have 0.9. Arrays and `@graph` are handled. If microdata repeats something already in the JSON-LD, it is dropped.

| schema.org type | `type` | Main fields |
|---|---|---|
| `Order` | `order` | `orderNumber`, `merchant`, `total {amount, currency}`, `status`, `orderDate`, `items [{name, sku, quantity, price}]`, `url` |
| `Invoice` | `invoice` | `invoiceNumber`, `merchant`, `total`, `dueDate`, `status`, `billingPeriod`, `customer` |
| `FlightReservation` | `flight` | `reservationNumber`, `passenger`, `flights [{flightNumber, airline, from {code, name}, to, departureTime, arrivalTime, gate, terminal}]`, `ticketNumber`, `seat` |
| `LodgingReservation` | `reservation` (`kind: "lodging"`) | `reservationNumber`, `name`, `location`, `guest`, `checkin`, `checkout` |
| `FoodEstablishmentReservation` | `reservation` (`kind: "restaurant"`) | `name`, `startTime`, `partySize` |
| `EventReservation` | `reservation` (`kind: "event"`) | `name`, `startTime`, `location` |
| `ParcelDelivery` | `shipment` | `trackingNumber`, `carrier`, `trackingUrl`, `status`, `expectedArrivalUntil`, `deliveryAddress`, `orderNumber`, `merchant` |
| `Event` (and `MusicEvent`, `BusinessEvent`, …) | `event` | `name`, `startDate`, `endDate`, `location`, `organizer` |

Values are passed through as the sender wrote them; for example, times keep their original offsets. Each schema.org type comes back as one result. A two-leg trip marked up as two `FlightReservation`s gives two results.

### From text heuristics

These have lower confidence, from 0.5 to 0.9, and `source: "heuristic"`. A heuristic result is skipped when structured data already gave the same type.

- **`otp`: `{ code, expiresInMinutes? }`**
  - **What counts as a code:** 4 to 8 digits near a keyword such as code, OTP, one-time password, verification, passcode, पासकोड, कोड or ओटीपी. Devanagari digits are converted to ASCII.
  - **Layouts:** the code can follow the keyword ("Your OTP is 482913"), come before it ("123456 is your verification code"), or sit alone on the next line, as in big-number HTML layouts. A code split as `481 552` on its own line is joined.
  - **Rejected:** amounts after a currency sign, masked account numbers (`XXXX4521`), phone numbers, digits glued to letters (`DASHAIN2026`), parts of dates and times, and years. A year-like number is accepted only directly after the keyword ("OTP is 2024").
  - **Not treated as keywords:** postal, promo and coupon codes.
  - **Expiry:** "valid for 5 minutes", "expires in 1 hour" and "१० मिनेट" become `expiresInMinutes`.
- **`order` / `invoice` / `receipt`:** `{ orderNumber?, invoiceNumber?, transactionId?, total?, merchant?, date?, dueDate? }`
  - **Numbers** are taken only from labelled values: `Order #…`, `Order ID: …`, `Invoice No: …`, `Transaction Code: …`, `Reference ID: …`, `अर्डर नं`, `बिल नं`. The value must contain a digit.
  - **Total:** the highest-priority labelled amount: "Grand Total", then "Total Amount" / "Amount Paid" / "Balance Due" / कुल रकम, then "Total" / जम्मा, then "Amount" / रकम. Subtotal, shipping, tax, discount and savings lines are skipped. If several equal labels appear, the last one wins.
  - **Type:** `invoice` if there is an invoice number or "invoice" in the subject; `order` if there is an order number; `receipt` for transaction or receipt numbers or payment wording.
  - **When a result appears:** only with a labelled number, or with a total plus a clearly transactional subject ("receipt", "invoice", "order confirmed", "payment successful", रसिद…). A newsletter full of prices and years gives nothing.
  - **`merchant`** comes from the From display name, or from the sender's domain if there is no name.
- **`shipment`: `{ trackingNumber, carrier?, trackingUrl?, status?, orderNumber?, merchant? }`**
  - **UPS:** `1Z` numbers are recognised anywhere, with confidence 0.85.
  - **Other numbers** must be labelled: "Tracking number", "Tracking ID", "AWB", "Waybill", "Consignment"…
  - **`carrier`** is filled only when a known carrier name appears: DHL, FedEx, UPS, USPS, Aramex, Blue Dart, Delhivery, DTDC, Ekart, India Post, Nepal Post, Pathao, Nepal Can Move, Upaya, Royal Mail, Canada Post, Australia Post, TNT or SF Express. Carriers are never guessed from the number's shape (apart from UPS `1Z`).
  - **`trackingUrl`:** a link containing the tracking number, else a "track" link.
  - **`status`:** `out-for-delivery`, `delivered` or `in-transit`, from the wording.
  - **Duplicates:** a courier email that only mentions an order number doesn't also produce an `order`.
- **`flight`: `{ flights: [{ flightNumber, airlineCode, number, date?, time?, from?, to? }], reservationNumber? }`**
  - **When it runs:** only if the email talks about flights (flight, e-ticket, boarding, itinerary, PNR, departure, उडान…).
  - **Flight codes:** a 2-character airline code (letters, or a letter and a digit, like `U4`) plus 1 to 4 digits, with common false positives removed (AM/PM, ID, NO, Q1–Q4 and others).
  - **Dates, times and routes:** taken from the same or nearby lines. Supported date forms are `14 Oct 2026`, `Oct 14, 2026`, `2026-10-14` and `14/10/2026` (read as day/month). Routes look like `KTM → PKR` or `KTM-PKR`.
  - **PNR:** read from labels such as "PNR", "Booking Reference" and "Confirmation code".

## Other exports

These helpers are exported too:
- `htmlToText`, `stripQuotedHtml`, `stripQuotedText`;
- `jsonLdBlocks`, `microdataItems`, `normaliseStructured`;
- `findOtp`, `findCommerce`, `findShipment`, `findFlights`, `findTotal`, `merchantFrom`;
- `parseAmount` (handles `1,23,456.50`, `1.234,50` and Devanagari digits), `findMoney`, `currencyCode`, `asciiDigits`.

## Limits

- **Heuristics can miss and can be wrong.** Show results as suggestions, such as a "Copy code" chip, rather than acting on them automatically. Use `confidence` to decide what to show.
- **Structured data is trusted as written.** It is not checked against the sender. Anyone can put JSON-LD in an email, so combine results with your SPF/DKIM/DMARC verdict (for example from `@lacspace/mail-auth`) before showing rich cards for brands.
- **Microdata support is basic:** `itemscope`, `itemtype` and `itemprop`, using `content`, `href`, `src` and `datetime` or the element's text. `itemref` and `itemid` are not supported.
- **Dates are Gregorian only.** Bikram Sambat dates are not converted. Ambiguous `dd/mm` vs `mm/dd` dates are read as day/month.
- **Quote detection** covers the common client formats listed above. Unusual reply formats may get through. Forwarded messages ("---------- Forwarded message ----------") are deliberately **not** removed, because forwarding a receipt is a common way to file it.
- **Languages:** keyword heuristics cover English and Nepali.

Built by [Lacspace](https://lacspace.com). Licensed under the Lacspace Free Licence v1.0 (see LICENSE).
