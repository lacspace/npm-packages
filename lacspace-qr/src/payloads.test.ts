import { describe, it, expect } from "vitest";
import {
  wifiPayload,
  vcardPayload,
  emailPayload,
  telPayload,
  smsPayload,
  geoPayload,
  urlPayload,
  escapeWifi,
} from "./payloads.js";

describe("wifiPayload", () => {
  it("formats a WPA network", () => {
    expect(wifiPayload({ ssid: "Home", password: "s3cret" })).toBe("WIFI:T:WPA;S:Home;P:s3cret;;");
  });

  it("marks open networks as nopass and omits the password", () => {
    expect(wifiPayload({ ssid: "Cafe", security: "nopass" })).toBe("WIFI:T:nopass;S:Cafe;;");
  });

  it("adds the hidden flag", () => {
    expect(wifiPayload({ ssid: "Secret", password: "p", hidden: true })).toBe("WIFI:T:WPA;S:Secret;P:p;H:true;;");
  });

  it("escapes reserved characters in ssid/password", () => {
    expect(escapeWifi('a;b,c:d"e\\f')).toBe('a\\;b\\,c\\:d\\"e\\\\f');
    expect(wifiPayload({ ssid: "My;Net", password: "a:b" })).toBe("WIFI:T:WPA;S:My\\;Net;P:a\\:b;;");
  });
});

describe("vcardPayload", () => {
  it("builds a vCard 3.0 with split name", () => {
    const v = vcardPayload({ name: "Ada Lovelace", tel: "+9779800000000", email: "ada@x.com" });
    expect(v).toContain("BEGIN:VCARD");
    expect(v).toContain("VERSION:3.0");
    expect(v).toContain("N:Lovelace;Ada;;;");
    expect(v).toContain("FN:Ada Lovelace");
    expect(v).toContain("TEL;TYPE=CELL:+9779800000000");
    expect(v).toContain("EMAIL:ada@x.com");
    expect(v.endsWith("END:VCARD")).toBe(true);
  });

  it("escapes commas and semicolons in fields", () => {
    const v = vcardPayload({ name: "X", org: "A, B; C" });
    expect(v).toContain("ORG:A\\, B\\; C");
  });
});

describe("emailPayload", () => {
  it("builds a bare mailto", () => {
    expect(emailPayload({ to: "a@b.com" })).toBe("mailto:a@b.com");
  });

  it("URL-encodes subject and body", () => {
    expect(emailPayload({ to: "a@b.com", subject: "Hi there", body: "a&b" })).toBe(
      "mailto:a@b.com?subject=Hi%20there&body=a%26b",
    );
  });
});

describe("tel / sms / geo", () => {
  it("formats tel and strips spaces", () => {
    expect(telPayload("+977 980 000 0000")).toBe("tel:+9779800000000");
  });

  it("formats SMSTO with and without a message", () => {
    expect(smsPayload({ number: "+15551234" })).toBe("SMSTO:+15551234");
    expect(smsPayload({ number: "+15551234", message: "hi" })).toBe("SMSTO:+15551234:hi");
  });

  it("formats geo coordinates", () => {
    expect(geoPayload(27.7172, 85.324)).toBe("geo:27.7172,85.324");
    expect(geoPayload(1, 2, 100)).toBe("geo:1,2,100");
  });

  it("rejects non-finite coordinates", () => {
    expect(() => geoPayload(NaN, 1)).toThrow();
  });
});

describe("urlPayload", () => {
  it("passes through URLs that already have a scheme", () => {
    expect(urlPayload("https://a.com")).toBe("https://a.com");
    expect(urlPayload("mailto:a@b.com")).toBe("mailto:a@b.com");
  });

  it("adds https:// when no scheme is present", () => {
    expect(urlPayload("lacspace.com")).toBe("https://lacspace.com");
  });
});
