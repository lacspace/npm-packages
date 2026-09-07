import { describe, it, expect } from "vitest";
import { createMessage, createMemoryTransport } from "./index";

describe("MessageBuilder", () => {
  it("builds a Mail with accumulated recipients and headers", () => {
    const mail = createMessage()
      .from("Lacspace <no-reply@lacspace.com>")
      .to("a@x.com")
      .to(["b@x.com"])
      .cc("c@x.com")
      .replyTo("support@lacspace.com")
      .subject("Hello")
      .html("<b>hi</b>")
      .header("X-Env", "prod")
      .build();

    expect(mail.to).toEqual(["a@x.com", "b@x.com"]);
    expect(mail.cc).toEqual(["c@x.com"]);
    expect(mail.replyTo).toBe("support@lacspace.com");
    expect(mail.headers).toEqual({ "X-Env": "prod" });
  });

  it("autoText() derives the text part from HTML when text is absent", () => {
    const mail = createMessage().from("a@x.com").to("b@x.com").subject("x").html("<p>Hi there</p>").autoText().build();
    expect(mail.text).toBe("Hi there");
  });

  it("does not overwrite an explicit text part", () => {
    const mail = createMessage().from("a@x.com").to("b@x.com").subject("x").html("<p>H</p>").text("explicit").autoText().build();
    expect(mail.text).toBe("explicit");
  });

  it("toMime() renders inline images as multipart/related", () => {
    const mime = createMessage()
      .from("a@x.com")
      .to("b@x.com")
      .subject("Logo")
      .html('<img src="cid:logo">')
      .inline({ filename: "logo.png", content: "PNG", contentType: "image/png", cid: "logo" })
      .toMime({ messageId: "<fixed@x.com>" });
    expect(mime).toContain("Content-Type: multipart/related");
    expect(mime).toContain("Content-ID: <logo>");
    expect(mime).toContain("Message-ID: <fixed@x.com>");
  });

  it("integrates with a memory transport end to end", async () => {
    const t = createMemoryTransport();
    const mail = createMessage().from("a@x.com").to("b@x.com").subject("hi").html("<b>hi</b>").autoText().build();
    await t.send(mail);
    expect(t.last!.mail.text).toBe("hi");
    expect(t.last!.mime).toContain("multipart/alternative");
  });
});
