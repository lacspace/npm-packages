import { describe, it, expect } from "vitest";
import { buildMime, type Mail, type Address } from "./index";

const FROM: Address = { address: "sender@lacspace.com" };
const ID = "<test@lacspace.com>";

describe("buildMime — alternative parts", () => {
  it("emits multipart/alternative with base64 text + html", () => {
    const mail: Mail = { to: "a@x.com", subject: "Hi", text: "hello", html: "<b>hello</b>" };
    const mime = buildMime(mail, FROM, ID);
    expect(mime).toContain("Content-Type: multipart/alternative");
    expect(mime).toContain("Content-Type: text/plain; charset=UTF-8");
    expect(mime).toContain("Content-Type: text/html; charset=UTF-8");
    // html body base64
    expect(mime).toContain(Buffer.from("<b>hello</b>", "utf8").toString("base64"));
  });

  it("RFC 2047 encodes a non-ASCII subject", () => {
    const mail: Mail = { to: "a@x.com", subject: "Welcome ✨", text: "x" };
    const mime = buildMime(mail, FROM, ID);
    expect(mime).toMatch(/Subject: =\?UTF-8\?B\?/);
  });
});

describe("buildMime — attachments", () => {
  it("wraps the body in multipart/mixed and base64-encodes the attachment", () => {
    const mail: Mail = {
      to: "a@x.com",
      subject: "Doc",
      text: "see attached",
      attachments: [{ filename: "hi.txt", content: "hello world", contentType: "text/plain" }],
    };
    const mime = buildMime(mail, FROM, ID);
    expect(mime).toContain("Content-Type: multipart/mixed");
    expect(mime).toContain('Content-Disposition: attachment; filename="hi.txt"');
    expect(mime).toContain(Buffer.from("hello world", "utf8").toString("base64"));
  });

  it("accepts Uint8Array content", () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const mail: Mail = {
      to: "a@x.com",
      subject: "Bin",
      text: "x",
      attachments: [{ filename: "b.bin", content: bytes }],
    };
    const mime = buildMime(mail, FROM, ID);
    expect(mime).toContain(Buffer.from(bytes).toString("base64"));
  });
});

describe("buildMime — inline CID images", () => {
  it("emits multipart/related with a Content-ID inline part", () => {
    const mail: Mail = {
      to: "a@x.com",
      subject: "Logo",
      html: '<img src="cid:logo1">',
      attachments: [{ filename: "logo.png", content: "PNGDATA", contentType: "image/png", cid: "logo1" }],
    };
    const mime = buildMime(mail, FROM, ID);
    expect(mime).toContain("Content-Type: multipart/related");
    expect(mime).toContain("Content-ID: <logo1>");
    expect(mime).toContain('Content-Disposition: inline; filename="logo.png"');
  });
});

describe("buildMime — custom headers", () => {
  it("appends caller headers", () => {
    const mail: Mail = { to: "a@x.com", subject: "x", text: "y", headers: { "X-Campaign": "spring" } };
    expect(buildMime(mail, FROM, ID)).toContain("X-Campaign: spring");
  });
});
