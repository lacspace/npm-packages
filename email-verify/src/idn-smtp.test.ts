import { test, expect } from "vitest";
import net from "node:net";
import { smtpCheck } from "./index";

// A tiny SMTP server on a free local port that records what the probe sends and,
// like a server without SMTPUTF8,, refuses a RCPT TO carrying non-ASCII bytes.
function fakeSmtp(): Promise<{ lines: string[]; port: number; close: () => void }> {
  const lines: string[] = [];
  const server = net.createServer((sock) => {
    sock.setEncoding("utf8");
    sock.on("error", () => {}); // the probe hangs up as soon as it has its answer
    sock.write("220 fake ESMTP\r\n");
    let buf = "";
    sock.on("data", (d: string) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        lines.push(line);
        if (line.startsWith("RCPT")) sock.write(/[^\x00-\x7f]/.test(line) ? "553 5.1.3 non-ASCII address\r\n" : "250 OK\r\n");
        else if (line.startsWith("QUIT")) sock.end("221 bye\r\n");
        else sock.write("250 OK\r\n");
      }
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ lines, port: (server.address() as net.AddressInfo).port, close: () => server.close() }));
  });
}

test("the SMTP probe sends a Unicode domain in its ASCII form", async () => {
  const srv = await fakeSmtp();
  try {
    const verdict = await smtpCheck("user@müller.de", "127.0.0.1", { fromAddress: "probe@example.com", timeout: 3000, port: srv.port });
    expect(srv.lines.find((l) => l.startsWith("RCPT"))).toBe("RCPT TO:<user@xn--mller-kva.de>");
    expect(verdict).toBe("deliverable");
  } finally {
    srv.close();
  }
});
