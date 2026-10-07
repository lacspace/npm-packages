import { describe, expect, it } from "vitest";
import { parseImapResponse } from "./parser.js";
import type { ImapList } from "./parser.js";
import { parseBodyStructure, parseEnvelope } from "./structures.js";

function fetchItem(line: string, key: string) {
  const r = parseImapResponse(line);
  const l = (r.attributes[0] as ImapList).value;
  for (let i = 0; i < l.length; i += 2) {
    const k = l[i];
    if (k && k.type === "atom" && k.value.toUpperCase() === key) return l[i + 1];
  }
  throw new Error("missing " + key);
}

describe("parseEnvelope", () => {
  it("parses RFC 3501 example with groups and encoded names", () => {
    const line =
      '* 12 FETCH (ENVELOPE ("Wed, 17 Jul 1996 02:23:25 -0700 (PDT)" "=?utf-8?B?SU1BUDRyZXYxIFdHIG1lZXRpbmcg4pyT?=" (("Terry Gray" NIL "gray" "cac.washington.edu")) (("Terry Gray" NIL "gray" "cac.washington.edu")) NIL ((NIL NIL "imap" "cac.washington.edu")) ((NIL NIL "minutes" "CNRI.Reston.VA.US")("=?iso-8859-1?Q?Jos=E9?=" NIL "jose" "example.com")) ((NIL NIL "undisclosed" NIL)(NIL NIL NIL NIL)) NIL "<B27397-0100000@cac.washington.edu>"))';
    const env = parseEnvelope(fetchItem(line, "ENVELOPE"));
    expect(env.date!.toISOString()).toBe("1996-07-17T09:23:25.000Z");
    expect(env.subject).toBe("IMAP4rev1 WG meeting ✓");
    expect(env.from).toEqual([{ name: "Terry Gray", address: "gray@cac.washington.edu" }]);
    expect(env.replyTo).toEqual([]);
    expect(env.cc[1]).toEqual({ name: "José", address: "jose@example.com" });
    expect(env.bcc).toEqual([]);
    expect(env.messageId).toBe("<B27397-0100000@cac.washington.edu>");
  });
});

describe("parseBodyStructure", () => {
  it("single part root is partId 1", () => {
    const bs = parseBodyStructure(
      fetchItem('* 1 FETCH (BODYSTRUCTURE ("TEXT" "PLAIN" ("CHARSET" "US-ASCII") NIL NIL "7BIT" 3028 92 NIL NIL NIL NIL))', "BODYSTRUCTURE"),
    )!;
    expect(bs).toEqual({ partId: "1", type: "text", subtype: "plain", params: { charset: "US-ASCII" }, encoding: "7bit", size: 3028, lines: 92 });
  });

  it("Gmail multipart/mixed with alternative + attachment (RFC 2231 filename)", () => {
    const line =
      '* 5 FETCH (UID 9 BODYSTRUCTURE ((("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "QUOTED-PRINTABLE" 120 4 NIL NIL NIL)("TEXT" "HTML" ("CHARSET" "UTF-8") NIL NIL "QUOTED-PRINTABLE" 400 9 NIL NIL NIL) "ALTERNATIVE" ("BOUNDARY" "000b") NIL NIL)("APPLICATION" "PDF" ("NAME" "=?UTF-8?B?4KSo4KSu?=.pdf") "<f_1>" NIL "BASE64" 5000 NIL ("ATTACHMENT" ("FILENAME*" "utf-8\'\'%E0%A4%A8%E0%A4%AE.pdf")) NIL) "MIXED" ("BOUNDARY" "000a") NIL ("en" "ne") "http://x"))';
    const bs = parseBodyStructure(fetchItem(line, "BODYSTRUCTURE"))!;
    expect(bs.partId).toBe("");
    expect(bs.type).toBe("multipart");
    expect(bs.subtype).toBe("mixed");
    expect(bs.params).toEqual({ boundary: "000a" });
    expect(bs.language).toEqual(["en", "ne"]);
    expect(bs.location).toBe("http://x");
    const [alt, pdf] = bs.children!;
    expect(alt!.partId).toBe("1");
    expect(alt!.children!.map((c) => [c.partId, c.subtype])).toEqual([
      ["1.1", "plain"],
      ["1.2", "html"],
    ]);
    expect(pdf).toMatchObject({
      partId: "2",
      type: "application",
      subtype: "pdf",
      id: "<f_1>",
      encoding: "base64",
      size: 5000,
      params: { name: "नम.pdf" },
      disposition: { type: "attachment", params: { filename: "नम.pdf" } },
    });
  });

  it("message/rfc822 child numbering", () => {
    const line =
      '* 1 FETCH (BODYSTRUCTURE (("TEXT" "PLAIN" NIL NIL NIL "7BIT" 10 1 NIL NIL NIL)("MESSAGE" "RFC822" NIL NIL NIL "7BIT" 900 (NIL "Fwd" NIL NIL NIL NIL NIL NIL NIL NIL) (("TEXT" "PLAIN" ("CHARSET" "utf-8") NIL NIL "7BIT" 5 1 NIL NIL NIL)("IMAGE" "PNG" NIL NIL NIL "BASE64" 50 NIL NIL NIL NIL) "MIXED" ("BOUNDARY" "b2") NIL NIL NIL) 20 NIL ("INLINE" NIL) NIL NIL) "MIXED" ("BOUNDARY" "b1") NIL NIL NIL))';
    const bs = parseBodyStructure(fetchItem(line, "BODYSTRUCTURE"))!;
    const msg = bs.children![1]!;
    expect(msg.partId).toBe("2");
    expect(msg.type).toBe("message");
    expect((msg.envelope as unknown[])[1]).toBe("Fwd");
    expect(msg.lines).toBe(20);
    expect(msg.disposition).toEqual({ type: "inline", params: {} });
    expect(msg.childNode!.partId).toBe("2");
    expect(msg.childNode!.children!.map((c) => c.partId)).toEqual(["2.1", "2.2"]);
  });

  it("message/rfc822 with single-part body → childNode 2.1; BODY without extensions (Exchange)", () => {
    const line =
      '* 1 FETCH (BODY (("TEXT" "PLAIN" NIL NIL NIL "7BIT" 10 1)("MESSAGE" "RFC822" NIL NIL NIL "7BIT" 90 (NIL NIL NIL NIL NIL NIL NIL NIL NIL NIL) ("TEXT" "HTML" NIL NIL NIL "8BIT" 30 2) 4) "MIXED"))';
    const bs = parseBodyStructure(fetchItem(line, "BODY"))!;
    expect(bs.children![1]!.childNode!.partId).toBe("2.1");
    expect(bs.children![1]!.childNode!.subtype).toBe("html");
    expect(bs.params).toEqual({});
  });
});
