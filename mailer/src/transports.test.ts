import { describe, it, expect } from "vitest";
import { createMemoryTransport, createJsonTransport, type Mail } from "./index";

const MAIL: Mail = { from: "s@lacspace.com", to: "a@x.com", cc: "c@x.com", subject: "hi", html: "<b>hi</b>" };

describe("MemoryTransport", () => {
  it("captures a sent message with rendered MIME and a result", async () => {
    const t = createMemoryTransport();
    const res = await t.send(MAIL);
    expect(t.messages).toHaveLength(1);
    expect(res.messageId).toMatch(/@lacspace\.com>$/);
    expect(res.accepted).toEqual(["a@x.com", "c@x.com"]);
    expect(t.last!.mime).toContain("Content-Type: text/html");
    expect(t.last!.mail.subject).toBe("hi");
  });

  it("verify() resolves true and reset() clears", async () => {
    const t = createMemoryTransport();
    await t.send(MAIL);
    expect(await t.verify()).toBe(true);
    t.reset();
    expect(t.messages).toHaveLength(0);
  });
});

describe("JsonTransport", () => {
  it("serialises the message to JSON in the response", async () => {
    let seen = "";
    const t = createJsonTransport((json) => (seen = json));
    const res = await t.send(MAIL);
    const parsed = JSON.parse(res.response);
    expect(parsed.subject).toBe("hi");
    expect(parsed.to).toEqual(["a@x.com"]);
    expect(parsed.cc).toEqual(["c@x.com"]);
    expect(JSON.parse(seen).from).toBe("s@lacspace.com");
  });
});
