import { describe, it, expect } from "vitest";
import {
  detectCarrier,
  isValidTrackingNumber,
  trackingUrl,
  CARRIER_TRACKING_URLS,
  normalizeTrackingStatus,
  FEDEX_STATUS_MAP,
  CourierError,
} from "./index";

describe("detectCarrier + isValidTrackingNumber", () => {
  it("detects a valid UPS number and passes its check digit", () => {
    const info = detectCarrier("1Z12345E0205271688");
    expect(info.valid).toBe(true);
    expect(info.carrier).toBe("ups");
    expect(info.candidates[0]!.checkDigitValid).toBe(true);
  });

  it("rejects a UPS number whose check digit is wrong", () => {
    // Same as above with the final check digit flipped 8 -> 7.
    const info = detectCarrier("1Z12345E0205271687");
    expect(isValidTrackingNumber("1Z12345E0205271687", "ups")).toBe(false);
    const ups = info.candidates.find((c) => c.carrier === "ups");
    expect(ups?.checkDigitValid).toBe(false);
  });

  it("normalizes spaces / hyphens / case before matching", () => {
    const info = detectCarrier(" 1z 12345e-0205271688 ");
    expect(info.normalized).toBe("1Z12345E0205271688");
    expect(info.carrier).toBe("ups");
  });

  it("validates a DHL Express 10-digit air waybill via mod-7", () => {
    expect(isValidTrackingNumber("1234567891", "dhl")).toBe(true); // 123456789 % 7 === 1
    expect(isValidTrackingNumber("1234567890", "dhl")).toBe(false);
  });

  it("validates a USPS IMpb 22-digit number via mod-10", () => {
    expect(isValidTrackingNumber("9400118992231974284902", "usps")).toBe(true);
    // flip the check digit
    expect(isValidTrackingNumber("9400118992231974284903", "usps")).toBe(false);
  });

  it("validates a UPU S10 number and maps the country to a carrier", () => {
    const info = detectCarrier("RB123456785GB");
    expect(info.valid).toBe(true);
    expect(info.carrier).toBe("royal_mail");
    expect(isValidTrackingNumber("RB123456785CA", "canada_post")).toBe(true);
  });

  it("prefers the check-digit-verified carrier over a format-only one", () => {
    // A 22-digit number that passes USPS mod-10 also matches FedEx by length.
    const info = detectCarrier("9400118992231974284902");
    expect(info.carrier).toBe("usps");
    expect(info.candidates.map((c) => c.carrier)).toContain("fedex");
  });

  it("falls back to the format-only carrier when the check digit fails", () => {
    // 22 digits, USPS mod-10 fails -> FedEx (no verified check digit) wins.
    const info = detectCarrier("9400118992231974284903");
    expect(info.carrier).toBe("fedex");
  });

  it("returns invalid (never throws) for junk input", () => {
    expect(detectCarrier("hello world").valid).toBe(false);
    expect(detectCarrier("").valid).toBe(false);
    // @ts-expect-error runtime guard for a non-string input
    expect(detectCarrier(undefined).valid).toBe(false);
    expect(isValidTrackingNumber("nope")).toBe(false);
  });
});

describe("trackingUrl", () => {
  it("builds a UPS and a FedEx tracking URL", () => {
    expect(trackingUrl("ups", "1Z12345E0205271688")).toBe(
      "https://www.ups.com/track?loc=en_US&tracknum=1Z12345E0205271688",
    );
    expect(trackingUrl("fedex", "123456789012")).toContain(
      "fedex.com/fedextrack/?trknbr=123456789012",
    );
  });

  it("url-encodes the tracking number", () => {
    expect(trackingUrl("usps", "AB 12/34")).toContain("AB%2012%2F34");
  });

  it("has a template for every carrier", () => {
    for (const carrier of Object.keys(CARRIER_TRACKING_URLS) as Array<
      keyof typeof CARRIER_TRACKING_URLS
    >) {
      expect(trackingUrl(carrier, "X1").startsWith("https://")).toBe(true);
    }
  });

  it("throws on an unknown carrier or empty tracking number", () => {
    // @ts-expect-error unknown carrier at runtime
    expect(() => trackingUrl("interstellar", "X1")).toThrow(CourierError);
    expect(() => trackingUrl("ups", "  ")).toThrow(CourierError);
    try {
      trackingUrl("ups", "");
    } catch (e) {
      expect((e as CourierError).code).toBe("invalid_tracking_number");
    }
  });
});

describe("normalizeTrackingStatus", () => {
  it("maps FedEx-style scan codes", () => {
    expect(normalizeTrackingStatus("DL")).toBe("delivered");
    expect(normalizeTrackingStatus("OD")).toBe("out_for_delivery");
    expect(normalizeTrackingStatus("IT")).toBe("in_transit");
    expect(normalizeTrackingStatus("PU")).toBe("picked_up");
    expect(FEDEX_STATUS_MAP.RS).toBe("returned");
  });

  it("maps free-text carrier statuses by keyword", () => {
    expect(normalizeTrackingStatus("Delivered, left with individual")).toBe("delivered");
    expect(normalizeTrackingStatus("Out for delivery")).toBe("out_for_delivery");
    expect(normalizeTrackingStatus("Arrived at Sort Facility")).toBe("in_transit");
    expect(normalizeTrackingStatus("Shipment information sent to FedEx")).toBe("confirmed");
    expect(normalizeTrackingStatus("Label Created")).toBe("confirmed");
    expect(normalizeTrackingStatus("Return to sender")).toBe("returned");
  });

  it("puts exceptions ahead of the happy path", () => {
    expect(normalizeTrackingStatus("Delivery attempt failed")).toBe("failed");
    expect(normalizeTrackingStatus("Delivery exception")).toBe("failed");
  });

  it("returns undefined for empty / unknown / non-string input", () => {
    expect(normalizeTrackingStatus("")).toBeUndefined();
    expect(normalizeTrackingStatus("banana")).toBeUndefined();
    // @ts-expect-error non-string at runtime
    expect(normalizeTrackingStatus(undefined)).toBeUndefined();
  });
});
