import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createMailer } from "./index";

// A minimal SMTP server: records the envelope and the DATA payload of each message.
interface Captured { from: string; to: string[]; data: string }
function fakeSmtp(): Promise<{ port: number; messages: Captured[]; close: () => Promise<void> }> {
  const messages: Captured[] = [];
  const server = net.createServer((sock) => {
    let buf = "";
    let inData = false;
    let cur: Captured = { from: "", to: [], data: "" };
    sock.write("220 fake ESMTP\r\n");
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      for (;;) {
        if (inData) {
          const end = buf.indexOf("\r\n.\r\n");
          if (end < 0) return;
          cur.data = buf.slice(0, end);
          buf = buf.slice(end + 5);
          inData = false;
          messages.push(cur);
          cur = { from: "", to: [], data: "" };
          sock.write("250 queued\r\n");
          continue;
        }
        const nl = buf.indexOf("\r\n");
        if (nl < 0) return;
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        const cmd = line.toUpperCase();
        if (cmd.startsWith("EHLO") || cmd.startsWith("HELO")) sock.write("250 fake\r\n");
        else if (cmd.startsWith("MAIL FROM:")) { cur.from = line.slice(10).replace(/[<>]/g, ""); sock.write("250 ok\r\n"); }
        else if (cmd.startsWith("RCPT TO:")) { cur.to.push(line.slice(8).replace(/[<>]/g, "")); sock.write("250 ok\r\n"); }
        else if (cmd === "DATA") { inData = true; sock.write("354 go\r\n"); }
        else if (cmd === "QUIT") { sock.write("221 bye\r\n"); sock.end(); }
        else if (cmd === "RSET") sock.write("250 ok\r\n");
        else sock.write("500 ?\r\n");
      }
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({ port, messages, close: () => new Promise((r) => server.close(() => r())) });
    }),
  );
}

let srv: Awaited<ReturnType<typeof fakeSmtp>> | undefined;
afterEach(async () => { await srv?.close(); srv = undefined; });

const cfg = (port: number, extra = {}) => ({ host: "127.0.0.1", port, secure: false, ignoreTLS: true, ...extra });

describe("signer hook + sendRaw (1.3.0)", () => {
  it("send() runs the signer on the finished message", async () => {
    srv = await fakeSmtp();
    const m = createMailer(cfg(srv.port, { signer: (raw: string) => `DKIM-Signature: v=1; test=yes\r\n${raw}` }));
    await m.send({ from: "a@x.com", to: "b@y.com", subject: "Hi", text: "hello" });
    expect(srv.messages[0]!.data.startsWith("DKIM-Signature: v=1; test=yes\r\n")).toBe(true);
    expect(srv.messages[0]!.data).toContain("Subject: Hi");
  });

  it("sendRaw() delivers a pre-built message as-is, Bcc only in the envelope", async () => {
    srv = await fakeSmtp();
    const raw = "From: a@x.com\nTo: b@y.com\nSubject: Raw\nMessage-ID: <id1@x.com>\n\nline one\n.starts with dot\n";
    const m = createMailer(cfg(srv.port));
    const r = await m.sendRaw(raw, { from: "a@x.com", to: ["b@y.com", "secret@z.com"] });
    const got = srv.messages[0]!;
    expect(got.from).toBe("a@x.com");
    expect(got.to).toEqual(["b@y.com", "secret@z.com"]);
    expect(got.data).not.toContain("secret@z.com");
    expect(got.data).toContain("Subject: Raw\r\nMessage-ID: <id1@x.com>\r\n\r\nline one\r\n..starts with dot"); // CRLF + dot-stuffed
    expect(r).toMatchObject({ messageId: "<id1@x.com>", accepted: ["b@y.com", "secret@z.com"] });
  });

  it("sendRaw() signs by default and skips signing with { sign: false }", async () => {
    srv = await fakeSmtp();
    const m = createMailer(cfg(srv.port, { signer: async (raw: string) => `X-Signed: 1\r\n${raw}` }));
    const raw = "From: a@x.com\r\nTo: b@y.com\r\nSubject: S\r\n\r\nbody";
    await m.sendRaw(raw, { from: "a@x.com", to: ["b@y.com"] });
    await m.sendRaw(raw, { from: "a@x.com", to: ["b@y.com"] }, { sign: false });
    expect(srv.messages[0]!.data.startsWith("X-Signed: 1\r\n")).toBe(true);
    expect(srv.messages[1]!.data.startsWith("From: a@x.com")).toBe(true);
  });

  it("sendRaw() rejects header injection in envelope addresses and empty recipients", async () => {
    srv = await fakeSmtp();
    const m = createMailer(cfg(srv.port));
    await expect(m.sendRaw("Subject: x\r\n\r\ny", { from: "a@x.com", to: [] })).rejects.toThrow(/no recipients/);
    await expect(m.sendRaw("Subject: x\r\n\r\ny", { from: "a@x.com", to: ["b@y.com\r\nRCPT TO:<evil@z.com>"] })).rejects.toThrow();
  });
});
