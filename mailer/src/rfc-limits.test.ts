import { describe, test, expect } from "vitest";
import { buildMime, encodeMimeWord as encodeWord, formatAddress, parseAddress } from "./index";

const FROM = { address: "s@example.com" };
const mime = (extra: object) => buildMime({ to: "a@example.com", subject: "x", text: "body", ...extra } as never, FROM, "<id@example.com>");
const header = (m: string, name: string) => {
  const head = m.split("\r\n\r\n")[0]!;
  const match = head.match(new RegExp(`^${name}: (.*(?:\\r\\n[ \\t].*)*)`, "m"));
  return match ? match[1]! : "";
};
// Minimal RFC 2047 decoder: unfold, drop whitespace between adjacent words, decode B-words.
const decode = (v: string) =>
  v
    .replace(/\r\n(?=[ \t])/g, "")
    .replace(/\?=\s+=\?/g, "?==?")
    .replace(/=\?UTF-8\?B\?([^?]*)\?=/g, (_, b) => Buffer.from(b, "base64").toString("utf8"));
const longest = (m: string) => Math.max(...m.split("\r\n").map((l) => l.length));

describe("RFC 5322 line length", () => {
  test("a long ASCII subject is folded and survives unchanged", () => {
    const subject = "Weekly digest: " + "an update about your account and the newest features ".repeat(25);
    const m = mime({ subject });
    expect(longest(m)).toBeLessThanOrEqual(78);
    expect(decode(header(m, "Subject"))).toBe(subject);
  });

  test("a long recipient list is folded between addresses", () => {
    const to = Array.from({ length: 60 }, (_, i) => ({ name: `Recipient ${i}`, address: `user${i}@example.com` }));
    const m = mime({ to });
    expect(longest(m)).toBeLessThanOrEqual(78);
    expect(header(m, "To").replace(/\r\n /g, " ").split(", ")).toHaveLength(60);
  });
});

describe("RFC 2047 encoded words", () => {
  test("no encoded word is longer than 75 characters, and text round-trips", () => {
    const subject = "你好世界，这是一个很长的主题行，用来测试编码词的长度限制。".repeat(4);
    const m = mime({ subject });
    for (const w of header(m, "Subject").match(/=\?[^?]+\?B\?[^?]*\?=/g)!) expect(w.length).toBeLessThanOrEqual(75);
    expect(decode(header(m, "Subject"))).toBe(subject);
  });

  test("words split between characters, never inside an emoji or accented letter", () => {
    const text = "🎉é".repeat(30);
    for (const w of encodeWord(text).split("\r\n ")) {
      const inner = Buffer.from(w.slice(10, -2), "base64").toString("utf8");
      expect(inner).not.toContain("\uFFFD");
    }
    expect(decode(encodeWord(text))).toBe(text);
  });

  test("a short value is still a single word", () => {
    expect(encodeWord("Añez")).toBe("=?UTF-8?B?QcOxZXo=?=");
  });
});

describe("display names", () => {
  test("RFC 5322 specials force quoting, with backslash and quote escaped", () => {
    expect(formatAddress({ name: "Team: Sales", address: "a@x.com" })).toBe('"Team: Sales" <a@x.com>');
    expect(formatAddress({ name: 'C:\\Path "q"', address: "a@x.com" })).toBe('"C:\\\\Path \\"q\\"" <a@x.com>');
    expect(formatAddress({ name: "John Q. Public", address: "a@x.com" })).toBe('"John Q. Public" <a@x.com>');
    expect(formatAddress({ name: "Plain Name", address: "a@x.com" })).toBe("Plain Name <a@x.com>");
  });

  test("parseAddress unescapes what formatAddress escapes", () => {
    const a = { name: 'C:\\Path "q"', address: "a@x.com" };
    expect(parseAddress(formatAddress(a))).toEqual(a);
  });
});

describe("attachment filenames", () => {
  test("a quote in a filename cannot add parameters", () => {
    const m = mime({ attachments: [{ filename: 'report".pdf"; x-evil="1', content: "a" }] });
    expect(m).toContain('filename="report\\".pdf\\"; x-evil=\\"1"');
    expect(m).not.toMatch(/filename="report"\.pdf"/);
  });

  test("non-ASCII filenames are encoded (encoded word + RFC 2231), never raw 8-bit", () => {
    const m = mime({ attachments: [{ filename: "报告 2026 – résumé.pdf", content: "a" }] });
    const head = m.slice(m.indexOf("Content-Type: application/octet-stream"));
    const partHead = head.slice(0, head.indexOf("\r\n\r\n"));
    expect(partHead).not.toMatch(/[^\x00-\x7f]/);
    expect(partHead).toContain("filename*=UTF-8''%E6%8A%A5%E5%91%8A%202026%20%E2%80%93%20r%C3%A9sum%C3%A9.pdf");
  });

  test("short ASCII filenames keep the one-line form", () => {
    expect(mime({ attachments: [{ filename: "hi.txt", content: "a" }] })).toContain('Content-Disposition: attachment; filename="hi.txt"');
  });
});
