import { describe, expect, it } from "vitest";

import {
  MimeError,
  buildMime,
  decodeBase64,
  decodeCharset,
  decodePart,
  decodeQuotedPrintable,
  decodeWords,
  encodeBase64,
  encodeQuotedPrintable,
  encodeWord,
  findTextParts,
  formatAddress,
  formatAddressList,
  forwardSubject,
  listAttachments,
  parseAddressList,
  parseBodyStructure,
  parseHeaderParams,
  parseHeaders,
  parseMime,
  replyHeaders,
  type BodyStructureNode,
  type PartNode,
} from "./index";

const crlf = (s: string) => s.replace(/\r?\n/g, "\r\n");
const txt = (b: Uint8Array) => new TextDecoder().decode(b);

/* ------------------------------ encoded words ------------------------------ */

describe("RFC 2047 encoded words", () => {
  it("decodes B (utf-8)", () => {
    expect(decodeWords("=?UTF-8?B?UsSBbSBCYWjEgWR1cg==?=")).toBe("Rām Bahādur");
  });
  it("decodes Q (iso-8859-1) with underscores", () => {
    expect(decodeWords("=?iso-8859-1?Q?R=E9union_demain?=")).toBe("Réunion demain");
  });
  it("removes whitespace between adjacent encoded words, keeps it around plain text", () => {
    expect(decodeWords("=?UTF-8?B?4KSo4KSu4KS44KWN4KSk4KWHIA==?=\r\n =?UTF-8?B?4KSm4KWB4KSo4KS/4KSv4KS+?=")).toBe("नमस्ते दुनिया");
    expect(decodeWords("Hello =?utf-8?q?W=C3=B6rld?= again")).toBe("Hello Wörld again");
    expect(decodeWords("=?utf-8?q?a?= =?utf-8?q?b?=")).toBe("ab");
  });
  it("joins a multibyte character split across two words", () => {
    expect(decodeWords("=?UTF-8?B?5pel5pys6Kqe4w==?= =?UTF-8?B?ga7jg4bjgq3jgrnjg4g=?=")).toBe("日本語のテキスト");
  });
  it("handles language suffix, lowercase, and unknown charsets without throwing", () => {
    expect(decodeWords("=?utf-8*en?q?hi?=")).toBe("hi");
    expect(decodeWords("=?x-unknown?q?caf=E9?=")).toBe("café");
    expect(decodeWords("plain text")).toBe("plain text");
  });
  it("decodes windows-1252 and koi8-r", () => {
    expect(decodeWords("=?windows-1252?Q?=93quoted=94?=")).toBe("“quoted”");
    expect(decodeWords("=?koi8-r?B?8NLJ18XU?=")).toBe("Привет");
  });
  it("encodeWord round-trips long non-ASCII text in ≤75-char words", () => {
    const s = "नमस्ते ".repeat(12).trim();
    const e = encodeWord(s);
    for (const w of e.split("\r\n ")) expect(w.length).toBeLessThanOrEqual(75);
    expect(decodeWords(e)).toBe(s);
  });
});

/* ------------------------------ params / headers ------------------------------ */

describe("headers and RFC 2231 parameters", () => {
  it("parses folded headers with CRLF or LF and decodes", () => {
    const h = parseHeaders("Subject: Hello\n world\nX-A: 1\nX-A: 2\nFrom: a@b.c\n\nbody");
    expect(h.get("subject")).toBe("Hello world");
    expect(h.getAll("x-a")).toEqual(["1", "2"]);
    expect(h.get("Body")).toBeUndefined();
    expect(h.entries().map(([k]) => k)).toEqual(["Subject", "X-A", "X-A", "From"]);
  });
  it("raw() keeps encoded words", () => {
    const h = parseHeaders("Subject: =?utf-8?q?caf=C3=A9?=\r\n\r\n");
    expect(h.raw("subject")).toBe("=?utf-8?q?caf=C3=A9?=");
    expect(h.get("subject")).toBe("café");
  });
  it("decodes RFC 2231 extended values", () => {
    const p = parseHeaderParams("attachment; filename*=utf-8''%E5%86%99%E7%9C%9F%20%E2%9C%93.jpg");
    expect(p.value).toBe("attachment");
    expect(p.params.filename).toBe("写真 ✓.jpg");
  });
  it("joins RFC 2231 continuations (mixed encoded / plain, out of order)", () => {
    const p = parseHeaderParams(
      `attachment;\r\n filename*1*=%C3%A9sum%C3%A9;\r\n filename*0*=iso-8859-1''R%E9;\r\n filename*2=".pdf"`.replace(/\r\n/g, ""),
    );
    // segment 0 declares charset; all encoded segments decode as one byte run
    expect(p.params.filename!.endsWith(".pdf")).toBe(true);
    const q = parseHeaderParams(`attachment; filename*0="very long "; filename*1="name.xls"`);
    expect(q.params.filename).toBe("very long name.xls");
  });
  it("decodes encoded words in quoted params and keeps semicolons inside quotes", () => {
    const p = parseHeaderParams(`text/plain; name="=?UTF-8?B?UsSBbSBCYWjEgWR1cg==?=.txt"; x="a;b"`);
    expect(p.params.name).toBe("Rām Bahādur.txt");
    expect(p.params.x).toBe("a;b");
  });
});

/* ------------------------------ addresses ------------------------------ */

describe("addresses", () => {
  it("parses quoted names with commas, comments, bare and groups", () => {
    const list = parseAddressList(`"Doe, John" <john@x.com>, bob@y.org (Bob Smith), Team: a@t.io, "B" <b@t.io>;, <bare@z.net>`);
    expect(list).toEqual([
      { name: "Doe, John", address: "john@x.com" },
      { name: "Bob Smith", address: "bob@y.org" },
      { name: "", address: "a@t.io", group: "Team" },
      { name: "B", address: "b@t.io", group: "Team" },
      { name: "", address: "bare@z.net" },
    ]);
  });
  it("decodes encoded-word names and handles empty groups", () => {
    expect(parseAddressList("=?UTF-8?B?UsSBbSBCYWjEgWR1cg==?= <ram@np.com>")).toEqual([{ name: "Rām Bahādur", address: "ram@np.com" }]);
    expect(parseAddressList("undisclosed-recipients:;")).toEqual([]);
  });
  it("tolerates missing angle brackets", () => {
    expect(parseAddressList("John Doe john@x.com")).toEqual([{ name: "John Doe", address: "john@x.com" }]);
  });
  it("formats addresses (quotes specials, encodes non-ASCII) and rejects CRLF", () => {
    expect(formatAddress({ name: "Doe, John", address: "j@x.com" })).toBe(`"Doe, John" <j@x.com>`);
    expect(formatAddress({ name: "Rām", address: "r@x.com" })).toMatch(/^=\?UTF-8\?B\?.+\?= <r@x\.com>$/);
    expect(formatAddressList(["a@x.com", { name: "B", address: "b@x.com" }])).toBe("a@x.com, B <b@x.com>");
    expect(() => formatAddress({ name: "x\r\nBcc: evil@x", address: "a@x.com" })).toThrow(MimeError);
  });
});

/* ------------------------------ codecs ------------------------------ */

describe("transfer encodings", () => {
  it("base64 tolerates junk, whitespace and missing padding", () => {
    expect(txt(decodeBase64("SGVs\r\nbG8g!!V29y bGQ"))).toBe("Hello World");
    expect(encodeBase64("Hello")).toBe("SGVsbG8=");
  });
  it("quoted-printable soft breaks, =XX, lowercase hex and stray =", () => {
    const qp = "Caf=C3=A9 au lait is a very long line that needs to be wrapped by the=\r\n encoder =3D ok=\n!\nbad =ZZ end=e2=9c=93";
    expect(new TextDecoder().decode(decodeQuotedPrintable(qp))).toBe(
      "Café au lait is a very long line that needs to be wrapped by the encoder = ok!\nbad =ZZ end✓",
    );
  });
  it("encodeQuotedPrintable keeps lines ≤ 76 and round-trips", () => {
    const s = "Ünïcödé ".repeat(30) + "\nline two  ";
    const e = encodeQuotedPrintable(s);
    for (const l of e.split("\r\n")) expect(l.length).toBeLessThanOrEqual(76);
    expect(new TextDecoder().decode(decodeQuotedPrintable(e))).toBe(s.replace("\n", "\r\n"));
  });
  it("charset aliases and fallbacks never throw", () => {
    const bytes = Uint8Array.from([0x43, 0x61, 0x66, 0xe9]);
    expect(decodeCharset(bytes, "ISO8859-1")).toBe("Café");
    expect(decodeCharset(bytes, "cp1252")).toBe("Café");
    expect(decodeCharset(bytes, "bogus-charset")).toBe("Café"); // utf-8 invalid → latin1
    expect(decodeCharset(new TextEncoder().encode("Café"), "us-ascii")).toBe("Café"); // mislabelled utf-8
    expect(decodeCharset(Uint8Array.from([0x82, 0xa0]), "x-sjis")).toBe("あ");
  });
});

/* ------------------------------ parseMime ------------------------------ */

const OUTLOOK = crlf(`Received: from DM6PR01MB1234.namprd01.prod.outlook.com
 by DM6PR01MB5678 with HTTPS; Tue, 1 Oct 2024 09:15:01 +0000
From: "Doe, John" <john.doe@contoso.com>
To: Jane <jane@example.com>, "Bob (Sales)" <bob@example.com>
CC: =?iso-8859-1?Q?Ren=E9e?= <renee@example.fr>
Subject: =?iso-8859-1?Q?R=E9union_demain?=
Thread-Topic: =?iso-8859-1?Q?R=E9union_demain?=
Date: Tue, 1 Oct 2024 09:15:00 +0000
Message-ID: <DM6PR01MB1234ABCD@DM6PR01MB1234.namprd01.prod.outlook.com>
Importance: high
X-Priority: 1
Content-Language: fr-FR
Content-Type: multipart/mixed;
	boundary="_004_DM6PR_"
MIME-Version: 1.0

--_004_DM6PR_
Content-Type: multipart/related;
	boundary="_003_DM6PR_";
	type="multipart/alternative"

--_003_DM6PR_
Content-Type: multipart/alternative;
	boundary="_000_DM6PR_"

--_000_DM6PR_
Content-Type: text/plain; charset="iso-8859-1"
Content-Transfer-Encoding: quoted-printable

Bonjour =E0 tous,=20
la r=E9union est demain.

--_000_DM6PR_
Content-Type: text/html; charset="iso-8859-1"
Content-Transfer-Encoding: quoted-printable

<html><body><p>Bonjour =E0 tous</p><img src=3D"cid:image001.png@01DB1234.A=
BCD"></body></html>

--_000_DM6PR_--

--_003_DM6PR_
Content-Type: image/png; name="image001.png"
Content-Description: image001.png
Content-Disposition: inline; filename="image001.png"; size=4;
	creation-date="Tue, 01 Oct 2024 09:15:00 GMT"
Content-ID: <image001.png@01DB1234.ABCD>
Content-Transfer-Encoding: base64

iVBORw==

--_003_DM6PR_--

--_004_DM6PR_
Content-Type: application/pdf; name="Q3 Report.pdf"
Content-Disposition: attachment; filename="Q3 Report.pdf"; size=9
Content-Transfer-Encoding: base64

JVBERi0xLjQK

--_004_DM6PR_
Content-Type: text/calendar; charset="utf-8"; method=REQUEST
Content-Transfer-Encoding: base64

QkVHSU46VkNBTEVOREFSDQpNRVRIT0Q6UkVRVUVTVA0KRU5EOlZDQUxFTkRBUg0K

--_004_DM6PR_--
`);

const GMAIL = crlf(`Delivered-To: team@lacspace.com
MIME-Version: 1.0
Date: Mon, 7 Oct 2024 18:30:12 +0545
Message-ID: <CAF=abc123XYZ@mail.gmail.com>
In-Reply-To: <prev@lacspace.com>
References: <root@lacspace.com>
 <prev@lacspace.com>
Subject: =?UTF-8?B?4KSo4KSu4KS44KWN4KSk4KWHIA==?= =?UTF-8?B?4KSm4KWB4KSo4KS/4KSv4KS+?=
From: =?UTF-8?B?UsSBbSBCYWjEgWR1cg==?= <ram@gmail.com>
To: team@lacspace.com
List-Unsubscribe: <mailto:unsub@news.example.com?subject=unsubscribe>,
 <https://news.example.com/u/abc123>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
Content-Type: multipart/alternative; boundary="000000000000a1b2c3"

--000000000000a1b2c3
Content-Type: text/plain; charset="UTF-8"
Content-Transfer-Encoding: base64

4KSo4KSu4KS44KWN4KSk4KWHIOCkpuClgeCkqOCkv+Ckr+Ckviwg4KSv4KWLIOCkquCksOClgOCk
leCljeCkt+CkoyDgpLjgpKjgpY3gpKbgpYfgpLYg4KS54KWL4KWkDQo=
--000000000000a1b2c3
Content-Type: text/html; charset="UTF-8"
Content-Transfer-Encoding: quoted-printable

<div dir=3D"ltr">=E0=A4=A8=E0=A4=AE=E0=A4=B8=E0=A5=8D=E0=A4=A4=E0=A5=87</div>
--000000000000a1b2c3--
`);

describe("parseMime — real-looking samples", () => {
  it("Outlook: nested mixed/related/alternative, cid image inline, pdf + calendar attachments", () => {
    const m = parseMime(OUTLOOK);
    expect(m.from).toEqual({ name: "Doe, John", address: "john.doe@contoso.com" });
    expect(m.to.map((a) => a.address)).toEqual(["jane@example.com", "bob@example.com"]);
    expect(m.to[1]!.name).toBe("Bob (Sales)");
    expect(m.cc).toEqual([{ name: "Renée", address: "renee@example.fr" }]);
    expect(m.subject).toBe("Réunion demain");
    expect(m.date?.toISOString()).toBe("2024-10-01T09:15:00.000Z");
    expect(m.messageId).toBe("<DM6PR01MB1234ABCD@DM6PR01MB1234.namprd01.prod.outlook.com>");
    expect(m.priority).toBe("high");
    expect(m.text).toBe("Bonjour à tous, \r\nla réunion est demain.\r\n");
    expect(m.html).toContain(`src="cid:image001.png@01DB1234.ABCD"`);
    expect(m.inline).toHaveLength(1);
    expect(m.inline[0]).toMatchObject({ partId: "1.2", filename: "image001.png", contentId: "image001.png@01DB1234.ABCD", disposition: "inline", size: 4 });
    expect(Array.from(m.inline[0]!.content)).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(m.attachments.map((a) => [a.partId, a.filename, a.contentType])).toEqual([
      ["2", "Q3 Report.pdf", "application/pdf"],
      ["3", "invite.ics", "text/calendar"],
    ]);
    expect(txt(m.attachments[0]!.content)).toBe("%PDF-1.4\n");
    expect(txt(m.attachments[1]!.content)).toContain("METHOD:REQUEST");
    expect(m.parts.partId).toBe("");
    expect(m.parts.children!.map((c) => c.partId)).toEqual(["1", "2", "3"]);
    expect(m.parts.children![0]!.children![0]!.children!.map((c) => c.partId)).toEqual(["1.1.1", "1.1.2"]);
    expect(m.parts.children![0]!.children![1]!.isInline).toBe(true);
  });

  it("Gmail: utf-8 B subject split over words, base64 Devanagari body, threading, one-click unsubscribe", () => {
    const m = parseMime(GMAIL);
    expect(m.subject).toBe("नमस्ते दुनिया");
    expect(m.from).toEqual({ name: "Rām Bahādur", address: "ram@gmail.com" });
    expect(m.text).toBe("नमस्ते दुनिया, यो परीक्षण सन्देश हो।\r\n");
    expect(m.html).toBe(`<div dir="ltr">नमस्ते</div>`);
    expect(m.inReplyTo).toBe("<prev@lacspace.com>");
    expect(m.references).toEqual(["<root@lacspace.com>", "<prev@lacspace.com>"]);
    expect(m.date?.toISOString()).toBe("2024-10-07T12:45:12.000Z");
    expect(m.listUnsubscribe).toEqual({
      urls: ["https://news.example.com/u/abc123"],
      mailto: "mailto:unsub@news.example.com?subject=unsubscribe",
      oneClick: true,
    });
    expect(m.attachments).toEqual([]);
    expect(m.parts.children!.map((c) => c.partId)).toEqual(["1", "2"]);
  });

  it("list-unsubscribe without Post header is not one-click", () => {
    const m = parseMime("From: a@b.c\nList-Unsubscribe: <https://x.io/u>\n\nhi");
    expect(m.listUnsubscribe).toEqual({ urls: ["https://x.io/u"], oneClick: false });
  });

  it("accepts Uint8Array input and decodes a windows-1252 8bit body", () => {
    const head = "From: a@b.c\r\nSubject: price\r\nContent-Type: text/plain; charset=windows-1252\r\nContent-Transfer-Encoding: 8bit\r\n\r\n";
    const bytes = new Uint8Array([...new TextEncoder().encode(head), 0x80, 0x20, 0x35, 0x20, 0x93, 0x6f, 0x6b, 0x94]);
    const m = parseMime(bytes);
    expect(m.text).toBe("€ 5 “ok”");
  });

  it("LF-only message with a single part and no Content-Type", () => {
    const m = parseMime("From: Alice <alice@x.com>\nTo: bob@y.com\nSubject: hi\n\nline 1\nline 2\n");
    expect(m.text).toBe("line 1\nline 2\n");
    expect(m.parts.partId).toBe("1");
    expect(m.parts.contentType).toBe("text/plain");
    expect(m.priority).toBe("normal");
  });

  it("raw 8-bit UTF-8 headers (RFC 6532) and string input with non-ASCII", () => {
    const m = parseMime("From: Zoë <zoe@x.com>\nSubject: Grüße\nContent-Type: text/plain; charset=iso-8859-1\nContent-Transfer-Encoding: 8bit\n\nHallo Zoë");
    expect(m.subject).toBe("Grüße");
    expect(m.from?.name).toBe("Zoë");
    expect(m.text).toBe("Hallo Zoë");
  });
});

describe("parseMime — structure edge cases", () => {
  it("message/rfc822 attachment: parsed recursively, exposed as attachment, partIds nested", () => {
    const raw = crlf(`From: a@x.com
Subject: Fwd: report
Content-Type: multipart/mixed; boundary="outer"

--outer
Content-Type: text/plain

See attached.
--outer
Content-Type: message/rfc822
Content-Disposition: attachment

From: Original <orig@y.com>
Subject: Quarterly report
Content-Type: multipart/alternative; boundary="inner"

--inner
Content-Type: text/plain

inner text
--inner
Content-Type: text/html

<b>inner html</b>
--inner--
--outer--
`);
    const m = parseMime(raw);
    expect(m.text).toBe("See attached.");
    expect(m.attachments).toHaveLength(1);
    const a = m.attachments[0]!;
    expect(a.contentType).toBe("message/rfc822");
    expect(a.filename).toBe("Quarterly report.eml");
    expect(a.partId).toBe("2");
    expect(a.message?.subject).toBe("Quarterly report");
    expect(a.message?.from?.address).toBe("orig@y.com");
    expect(a.message?.html).toBe("<b>inner html</b>");
    expect(txt(a.content)).toContain("Subject: Quarterly report");
    const node = m.parts.children![1]!;
    expect(node.childNode!.partId).toBe("2");
    expect(node.childNode!.children!.map((c) => c.partId)).toEqual(["2.1", "2.2"]);
  });

  it("uses the encapsulated message's body when the outer has none", () => {
    const raw = crlf(`From: a@x.com
Content-Type: message/rfc822

From: b@y.com
Subject: inner

only inner body
`);
    const m = parseMime(raw);
    expect(m.text).toBe("only inner body\r\n");
    expect(m.attachments[0]!.contentType).toBe("message/rfc822");
    expect(m.parts.childNode!.partId).toBe("1.1");
  });

  it("missing final boundary, preamble and epilogue", () => {
    const raw = crlf(`Content-Type: multipart/mixed; boundary=XYZ

This is a multi-part message in MIME format.
--XYZ
Content-Type: text/plain

first
--XYZ
Content-Type: application/octet-stream; name=data.bin
Content-Transfer-Encoding: base64

AAEC`);
    const m = parseMime(raw);
    expect(m.text).toBe("first");
    expect(m.attachments).toHaveLength(1);
    expect(Array.from(m.attachments[0]!.content)).toEqual([0, 1, 2]);
    const withEpilogue = parseMime(raw + "\r\n--XYZ--\r\nepilogue junk --XYZ\r\n");
    expect(withEpilogue.attachments).toHaveLength(1);
  });

  it("malformed: wrong boundary falls back to readable text; guesses a missing boundary param", () => {
    const wrong = parseMime("Content-Type: multipart/mixed; boundary=nothere\n\njust some text\n");
    expect(wrong.text).toBe("just some text\n");
    const guessed = parseMime("Content-Type: multipart/mixed\n\n--abc\nContent-Type: text/plain\n\nhello\n--abc--\n");
    expect(guessed.text).toBe("hello");
  });

  it("boundary that prefixes a nested boundary is not confused", () => {
    const raw = crlf(`Content-Type: multipart/mixed; boundary="b"

--b
Content-Type: multipart/alternative; boundary="b-inner"

--b-inner
Content-Type: text/plain

plain
--b-inner
Content-Type: text/html

<p>html</p>
--b-inner--
--b
Content-Type: image/gif; name="x.gif"
Content-Transfer-Encoding: base64

R0lGODlh
--b--`);
    const m = parseMime(raw);
    expect(m.text).toBe("plain");
    expect(m.html).toBe("<p>html</p>");
    expect(m.attachments.map((a) => a.filename)).toEqual(["x.gif"]);
  });

  it("multipart/signed keeps the signed content and hides the signature", () => {
    const raw = crlf(`Content-Type: multipart/signed; protocol="application/pgp-signature"; micalg=pgp-sha256; boundary="sig"

--sig
Content-Type: text/plain; charset=utf-8

signed body
--sig
Content-Type: application/pgp-signature; name="signature.asc"

-----BEGIN PGP SIGNATURE-----
-----END PGP SIGNATURE-----
--sig--`);
    const m = parseMime(raw);
    expect(m.text).toBe("signed body");
    expect(m.attachments).toEqual([]);
    expect(m.parts.children).toHaveLength(2);
  });

  it("multipart/report (bounce) exposes delivery-status and original headers as attachments", () => {
    const raw = crlf(`From: MAILER-DAEMON@mx.example.com
Subject: Undelivered Mail Returned to Sender
Content-Type: multipart/report; report-type=delivery-status; boundary="R"

--R
Content-Type: text/plain

Your message could not be delivered.
--R
Content-Type: message/delivery-status

Reporting-MTA: dns; mx.example.com
Final-Recipient: rfc822; nobody@example.com
Status: 5.1.1
--R
Content-Type: text/rfc822-headers

From: me@x.com
Subject: hi
--R--`);
    const m = parseMime(raw);
    expect(m.text).toBe("Your message could not be delivered.");
    expect(m.attachments.map((a) => a.contentType)).toEqual(["message/delivery-status", "text/rfc822-headers"]);
  });

  it("alternative prefers the last renderable part and keeps text/plain as text", () => {
    const raw = crlf(`Content-Type: multipart/alternative; boundary=A

--A
Content-Type: text/plain

plain v
--A
Content-Type: text/html

<p>first html</p>
--A
Content-Type: text/html

<p>best html</p>
--A--`);
    const m = parseMime(raw);
    expect(m.text).toBe("plain v");
    expect(m.html).toBe("<p>best html</p>");
  });

  it("RFC 2231 filename in a parsed message, and text attachment with filename is not body", () => {
    const raw = crlf(`Content-Type: multipart/mixed; boundary=M

--M
Content-Type: text/plain

body
--M
Content-Type: text/plain; charset=utf-8
Content-Disposition: attachment;
 filename*0*=utf-8''%E0%A4%A8%E0%A5%87%E0%A4%AA;
 filename*1*=%E0%A4%BE%E0%A4%B2.txt

file content
--M--`);
    const m = parseMime(raw);
    expect(m.text).toBe("body");
    expect(m.attachments[0]!.filename).toBe("नेपाल.txt");
    expect(m.attachments[0]!.charset).toBe("utf-8");
  });

  it("never throws on garbage and honours maxParts / maxDepth / maxSize", () => {
    for (const junk of ["", "\r\n\r\n", ":::::", "Content-Type: multipart/mixed; boundary=\"\n\n--", "=?utf-8?B?####?=", "\u0000\u0001\u0002"]) {
      expect(() => parseMime(junk)).not.toThrow();
    }
    let nested = "From: a@b.c\nContent-Type: text/plain\n\ndeep";
    for (let i = 0; i < 30; i++) nested = `Content-Type: message/rfc822\n\n${nested}`;
    const d = parseMime(nested, { maxDepth: 5 });
    expect(d.truncated).toBe(true);
    const many = "Content-Type: multipart/mixed; boundary=Z\n\n" + Array.from({ length: 50 }, (_, i) => `--Z\nContent-Type: application/x-a; name=a${i}\n\nx\n`).join("") + "--Z--\n";
    const p = parseMime(many, { maxParts: 10 });
    expect(p.truncated).toBe(true);
    expect(p.attachments.length).toBeLessThan(10);
    const s = parseMime("Subject: x\n\n" + "a".repeat(1000), { maxSize: 100 });
    expect(s.truncated).toBe(true);
    expect(s.text!.length).toBeLessThan(100);
  });

  it("dates: named zones, 2-digit years, comments, invalid → null", () => {
    expect(parseMime("Date: Fri, 21 Nov 97 09:55:06 -0600\n\n").date?.toISOString()).toBe("1997-11-21T15:55:06.000Z");
    expect(parseMime("Date: Thu, 13 Feb 1969 23:32 -0330 (Newfoundland Time)\n\n").date?.toISOString()).toBe("1969-02-14T03:02:00.000Z");
    expect(parseMime("Date: 1 Jan 2024 00:00:00 PST\n\n").date?.toISOString()).toBe("2024-01-01T08:00:00.000Z");
    expect(parseMime("Date: not a date\n\n").date).toBeNull();
  });

  it("priority from X-Priority low / Priority urgent", () => {
    expect(parseMime("X-Priority: 5 (Lowest)\n\n").priority).toBe("low");
    expect(parseMime("Priority: urgent\n\n").priority).toBe("high");
  });
});

/* ------------------------------ BODYSTRUCTURE ------------------------------ */

const GMAIL_BS =
  `* 12 FETCH (UID 345 BODYSTRUCTURE ((("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "QUOTED-PRINTABLE" 1234 30 NIL NIL NIL)` +
  `("TEXT" "HTML" ("CHARSET" "UTF-8") NIL NIL "QUOTED-PRINTABLE" 5678 80 NIL NIL NIL) "ALTERNATIVE" ("BOUNDARY" "000000000000abcd") NIL NIL)` +
  `("APPLICATION" "PDF" ("NAME" "invoice.pdf") "<f_abc123>" NIL "BASE64" 40000 NIL ("ATTACHMENT" ("FILENAME" "invoice.pdf")) NIL) "MIXED" ("BOUNDARY" "000000000000efgh") NIL NIL))`;

const DOVECOT_BS =
  `(((("text" "plain" ("charset" "utf-8") NIL NIL "7bit" 20 2 NIL NIL NIL NIL)` +
  `("text" "html" ("charset" "utf-8") NIL NIL "quoted-printable" 300 10 NIL NIL NIL NIL) "alternative" ("boundary" "b2") NIL NIL NIL)` +
  `("image" "png" ("name" "logo.png") "<logo@x>" NIL "base64" 1000 NIL ("inline" ("filename" "logo.png")) NIL NIL) "related" ("boundary" "b1" "type" "multipart/alternative") NIL NIL NIL)` +
  `("message" "rfc822" NIL NIL NIL "7bit" 900 ("Mon, 1 Jan 2024 10:00:00 +0000" "Inner \\"quoted\\"" (("A" NIL "a" "x.com")) NIL NIL NIL NIL NIL NIL "<inner@x>")` +
  ` (("text" "plain" ("charset" "us-ascii") NIL NIL "7bit" 10 1 NIL NIL NIL NIL)("image" "jpeg" NIL NIL NIL "base64" 500 NIL ("attachment" ("filename*" "utf-8''%E5%86%99%E7%9C%9F.jpg")) NIL NIL) "mixed" ("boundary" "b3") NIL NIL NIL)` +
  ` 30 NIL ("attachment" ("filename" "fwd.eml")) NIL NIL)` +
  `("application" "octet-stream" ("name" {13}\r\nreport Q3.xls) NIL NIL "base64" 2048 NIL ("attachment" ("filename*0" "very long " "filename*1" "name.xls")) ("en" "ne") "https://x.io/r") "mixed" ("boundary" "b0") NIL NIL NIL)`;

const EXCHANGE_BS =
  `BODYSTRUCTURE (("TEXT" "HTML" ("CHARSET" "utf-8") NIL NIL "QUOTED-PRINTABLE" 1500 40 NIL NIL ("en-US") NIL)` +
  `("MESSAGE" "RFC822" ("NAME" "Fwd.eml") NIL NIL "7BIT" 800 (NIL "Original" NIL NIL NIL NIL NIL NIL NIL NIL) ("TEXT" "PLAIN" ("CHARSET" "us-ascii") NIL NIL "7BIT" 100 4 NIL NIL NIL NIL) 20 NIL ` +
  `("ATTACHMENT" ("FILENAME" "Fwd.eml" "SIZE" "800" "CREATION-DATE" "Tue, 01 Oct 2024 10:00:00 GMT")) NIL NIL) "MIXED" ("BOUNDARY" "_002_") NIL ("en-US") NIL)`;

const ids = (n: PartNode): string[] => [n.partId, ...(n.children ?? []).flatMap(ids), ...(n.childNode ? ids(n.childNode) : [])];

describe("parseBodyStructure", () => {
  it("Gmail FETCH line: partIds, lowercase, params, disposition", () => {
    const t = parseBodyStructure(GMAIL_BS);
    expect(ids(t)).toEqual(["", "1", "1.1", "1.2", "2"]);
    expect(t.contentType).toBe("multipart/mixed");
    expect(t.params.boundary).toBe("000000000000efgh");
    const pdf = t.children![1]!;
    expect(pdf).toMatchObject({ type: "application", subtype: "pdf", encoding: "base64", size: 40000, id: "<f_abc123>", filename: "invoice.pdf" });
    expect(pdf.disposition).toEqual({ type: "attachment", params: { filename: "invoice.pdf" } });
    const tp = findTextParts(t);
    expect(tp.text?.partId).toBe("1.1");
    expect(tp.html?.partId).toBe("1.2");
    expect(tp.text?.lines).toBe(30);
    expect(listAttachments(t).map((n) => n.partId)).toEqual(["2"]);
  });

  it("Dovecot: related+cid, message/rfc822 with envelope and nested multipart, literals, RFC 2231, extension data", () => {
    const t = parseBodyStructure(DOVECOT_BS);
    expect(ids(t)).toEqual(["", "1", "1.1", "1.1.1", "1.1.2", "1.2", "2", "2", "2.1", "2.2", "3"]);
    const msg = t.children![1]!;
    expect(msg.contentType).toBe("message/rfc822");
    expect(Array.isArray(msg.envelope)).toBe(true);
    expect((msg.envelope as unknown[])[1]).toBe(`Inner "quoted"`);
    expect(msg.lines).toBe(30);
    expect(msg.filename).toBe("fwd.eml");
    expect(msg.childNode!.children![1]!.filename).toBe("写真.jpg");
    const xls = t.children![2]!;
    expect(xls.params.name).toBe("report Q3.xls");
    expect(xls.filename).toBe("very long name.xls");
    expect(xls.language).toEqual(["en", "ne"]);
    expect(xls.location).toBe("https://x.io/r");
    const tp = findTextParts(t);
    expect([tp.text?.partId, tp.html?.partId]).toEqual(["1.1.1", "1.1.2"]);
    const atts = listAttachments(t);
    expect(atts.map((n) => [n.partId, n.isAttachment, n.isInline])).toEqual([
      ["2", true, false],
      ["3", true, false],
      ["1.2", false, true],
    ]);
  });

  it("Exchange: BODYSTRUCTURE keyword, single-part rfc822 child gets P.1, uppercase normalised", () => {
    const t = parseBodyStructure(EXCHANGE_BS);
    expect(ids(t)).toEqual(["", "1", "2", "2.1"]);
    expect(t.language).toEqual(["en-US"]);
    expect(t.children![0]!.language).toEqual(["en-US"]);
    const msg = t.children![1]!;
    expect(msg.disposition?.params["creation-date"]).toBe("Tue, 01 Oct 2024 10:00:00 GMT");
    expect(msg.childNode).toMatchObject({ partId: "2.1", contentType: "text/plain", lines: 4 });
    expect(findTextParts(t)).toMatchObject({ html: { partId: "1" } });
    expect(findTextParts(t).text).toBeUndefined();
  });

  it("single-part root is partId 1; falls back to inner message body when outer has none", () => {
    const single = parseBodyStructure(`("TEXT" "PLAIN" ("CHARSET" "windows-1252" "FORMAT" "flowed") NIL NIL "QUOTED-PRINTABLE" 120 3 NIL NIL NIL NIL)`);
    expect(single.partId).toBe("1");
    expect(single.params).toEqual({ charset: "windows-1252", format: "flowed" });
    const onlyMsg = parseBodyStructure(`("MESSAGE" "RFC822" NIL NIL NIL "7BIT" 50 NIL ("TEXT" "PLAIN" NIL NIL NIL "7BIT" 5 1 NIL NIL NIL NIL) 3)`);
    expect(findTextParts(onlyMsg).text?.partId).toBe("1.1");
  });

  it("accepts an already-parsed BodyStructureNode (the @lacspace/imap shape) without mutating it", () => {
    const input: BodyStructureNode = {
      partId: "",
      type: "multipart",
      subtype: "mixed",
      params: { boundary: "x" },
      children: [
        { partId: "1", type: "text", subtype: "plain", params: { charset: "utf-8" }, encoding: "7bit", size: 5 },
        { partId: "2", type: "image", subtype: "jpeg", params: {}, encoding: "base64", disposition: { type: "attachment", params: { filename: "a.jpg" } } },
      ],
    };
    const t = parseBodyStructure(input);
    expect(t.children![1]!.filename).toBe("a.jpg");
    expect(t.children![1]!.isAttachment).toBe(true);
    expect(t.children![0]!.isAttachment).toBe(false);
    expect(findTextParts(input).text?.partId).toBe("1");
    expect(listAttachments(input).map((n) => n.filename)).toEqual(["a.jpg"]);
    expect("contentType" in input).toBe(false);
  });

  it("never throws on malformed input", () => {
    for (const bad of ["", "(", "((((", "garbage", `("TEXT"`, "{999}\r\nab"]) {
      expect(() => parseBodyStructure(bad)).not.toThrow();
    }
  });

  it("decodePart: QP windows-1252 text → string, base64 image → bytes", () => {
    expect(decodePart("Caf=E9 =80", { type: "text", encoding: "quoted-printable", params: { charset: "windows-1252" } })).toBe("Café €");
    const img = decodePart(new TextEncoder().encode("iVBO\r\nRw=="), { type: "image", encoding: "base64", params: {} });
    expect(Array.from(img as Uint8Array)).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});

/* ------------------------------ buildMime ------------------------------ */

describe("buildMime", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const pdf = new Uint8Array(3000).map((_, i) => i % 256);
  const mail = {
    from: { name: "Rām Bahādur", address: "ram@lacspace.com" },
    to: ["Jane <jane@example.com>", { name: "Doe, John", address: "john@example.com" }],
    cc: "cc@example.com",
    bcc: "secret@example.com",
    replyTo: "support@lacspace.com",
    subject: "नमस्ते — quarterly report",
    text: "Hello,\nSee the report. Ünïcödé text with a very long line that goes way past seventy-six characters for sure.\n",
    html: `<p>Hello</p><img src="cid:logo@lacspace">`,
    attachments: [
      { filename: "logo.png", content: png, contentId: "logo@lacspace" },
      { filename: "रिपोर्ट Q3.pdf", content: pdf },
      { filename: "notes.txt", content: "plain notes" },
    ],
    inReplyTo: "<prev@x.com>",
    references: ["<root@x.com>", "prev@x.com"],
    headers: { "X-Mailer": "Lacspace Mail" },
    date: new Date("2024-10-07T12:00:00Z"),
  };

  it("produces CRLF-only output, 76-col base64, mixed(alternative(text, related(html, cid)), attachments)", () => {
    const raw = buildMime(mail);
    expect(/(^|[^\r])\n/.test(raw)).toBe(false);
    for (const line of raw.split("\r\n")) expect(line.length).toBeLessThanOrEqual(998);
    expect(raw).toMatch(/^Date: /);
    expect(raw).not.toMatch(/^Bcc:/im);
    expect(raw).not.toContain("secret@example.com");
    expect(raw).toMatch(/Message-ID: <[^@\s]+@lacspace\.com>/);
    const m = parseMime(raw);
    expect(m.parts.contentType).toBe("multipart/mixed");
    const alt = m.parts.children![0]!;
    expect(alt.contentType).toBe("multipart/alternative");
    expect(alt.children![1]!.contentType).toBe("multipart/related");
    const b64lines = raw.split("\r\n").filter((l) => /^[A-Za-z0-9+/=]{60,}$/.test(l));
    expect(b64lines.length).toBeGreaterThan(0);
    for (const l of b64lines) expect(l.length).toBeLessThanOrEqual(76);
  });

  it("round-trips through parseMime", () => {
    const m = parseMime(buildMime(mail));
    expect(m.from).toEqual({ name: "Rām Bahādur", address: "ram@lacspace.com" });
    expect(m.to).toEqual([
      { name: "Jane", address: "jane@example.com" },
      { name: "Doe, John", address: "john@example.com" },
    ]);
    expect(m.cc).toEqual([{ name: "", address: "cc@example.com" }]);
    expect(m.bcc).toEqual([]);
    expect(m.replyTo[0]!.address).toBe("support@lacspace.com");
    expect(m.subject).toBe(mail.subject);
    expect(m.text).toBe(mail.text.replace(/\n/g, "\r\n"));
    expect(m.html).toBe(mail.html);
    expect(m.date?.toISOString()).toBe("2024-10-07T12:00:00.000Z");
    expect(m.inReplyTo).toBe("<prev@x.com>");
    expect(m.references).toEqual(["<root@x.com>", "<prev@x.com>"]);
    expect(m.headers.get("x-mailer")).toBe("Lacspace Mail");
    expect(m.inline).toHaveLength(1);
    expect(m.inline[0]).toMatchObject({ filename: "logo.png", contentId: "logo@lacspace", contentType: "image/png" });
    expect(Array.from(m.inline[0]!.content)).toEqual(Array.from(png));
    expect(m.attachments.map((a) => [a.filename, a.contentType])).toEqual([
      ["रिपोर्ट Q3.pdf", "application/pdf"],
      ["notes.txt", "text/plain"],
    ]);
    expect(Array.from(m.attachments[0]!.content)).toEqual(Array.from(pdf));
    expect(txt(m.attachments[1]!.content)).toBe("plain notes");
  });

  it("collapses levels: text only is a single part; html + cid without text is related", () => {
    const one = parseMime(buildMime({ from: "a@x.com", to: "b@y.com", subject: "s", text: "hi" }));
    expect(one.parts.contentType).toBe("text/plain");
    expect(one.parts.encoding).toBe("7bit");
    expect(one.text).toBe("hi");
    const rel = parseMime(buildMime({ from: "a@x.com", html: "<img src=cid:i>", attachments: [{ filename: "i.png", content: png, contentId: "i" }] }));
    expect(rel.parts.contentType).toBe("multipart/related");
    expect(rel.inline).toHaveLength(1);
    expect(rel.to).toEqual([]);
    expect(rel.headers.get("to")).toBe("undisclosed-recipients:;");
  });

  it("uses quoted-printable for mostly-ASCII long/non-ASCII text and base64 for mostly non-ASCII", () => {
    const qp = buildMime({ from: "a@x.com", text: "Café au lait, ".repeat(20) });
    expect(qp).toContain("Content-Transfer-Encoding: quoted-printable");
    const b64 = buildMime({ from: "a@x.com", text: "नमस्ते दुनिया" });
    expect(b64).toContain("Content-Transfer-Encoding: base64");
    expect(parseMime(b64).text).toBe("नमस्ते दुनिया");
  });

  it("rejects header injection everywhere", () => {
    const base = { from: "a@x.com", to: "b@y.com" };
    expect(() => buildMime({ ...base, subject: "hi\r\nBcc: evil@x.com" })).toThrow(MimeError);
    expect(() => buildMime({ ...base, to: "b@y.com\nBcc: evil@x.com" })).toThrow(MimeError);
    expect(() => buildMime({ ...base, from: { name: "x\nBcc: e@x", address: "a@x.com" } })).toThrow(MimeError);
    expect(() => buildMime({ ...base, headers: { "X-Test": "v\r\nBcc: e@x" } })).toThrow(MimeError);
    expect(() => buildMime({ ...base, headers: { "Bad Name": "v" } })).toThrow(MimeError);
    expect(() => buildMime({ ...base, headers: { "Content-Type": "text/html" } })).toThrow(MimeError);
    expect(() => buildMime({ ...base, attachments: [{ filename: "a\r\n.txt", content: "x" }] })).toThrow(MimeError);
    expect(() => buildMime({ ...base, inReplyTo: "<a@b>\r\nBcc: e@x" })).toThrow(MimeError);
    expect(() => buildMime({ ...base, messageId: "<a b@c>" })).toThrow(MimeError);
  });

  it("keeps a given Message-ID and folds long subjects", () => {
    const raw = buildMime({ from: "a@x.com", to: "b@y.com", messageId: "custom@x.com", subject: "word ".repeat(40).trim() });
    expect(raw).toContain("Message-ID: <custom@x.com>");
    for (const l of raw.split("\r\n")) expect(l.length).toBeLessThanOrEqual(78);
    expect(parseMime(raw).subject).toBe("word ".repeat(40).trim());
  });
});

/* ------------------------------ reply / forward ------------------------------ */

describe("replyHeaders / forwardSubject", () => {
  it("builds threading headers without stacking Re:", () => {
    const m = parseMime(GMAIL);
    const r = replyHeaders(m);
    expect(r.inReplyTo).toBe("<CAF=abc123XYZ@mail.gmail.com>");
    expect(r.references).toEqual(["<root@lacspace.com>", "<prev@lacspace.com>", "<CAF=abc123XYZ@mail.gmail.com>"]);
    expect(r.subject).toBe("Re: नमस्ते दुनिया");
    expect(replyHeaders({ ...m, subject: "RE: Re[2]: Aw: hello" }).subject).toBe("Re: hello");
    expect(replyHeaders({ subject: "x", references: [], inReplyTo: "<p@x>", messageId: "<m@x>" }).references).toEqual(["<p@x>", "<m@x>"]);
  });
  it("forwardSubject", () => {
    expect(forwardSubject("Fwd: FW: report")).toBe("Fwd: report");
    expect(forwardSubject({ subject: "Report" })).toBe("Fwd: Report");
  });
  it("reply built with replyHeaders threads correctly on parse", () => {
    const orig = parseMime(GMAIL);
    const raw = buildMime({ from: "team@lacspace.com", to: orig.from!, text: "thanks", ...replyHeaders(orig) });
    const back = parseMime(raw);
    expect(back.inReplyTo).toBe(orig.messageId);
    expect(back.references.at(-1)).toBe(orig.messageId);
    expect(back.subject).toBe("Re: नमस्ते दुनिया");
  });
});

describe("1.0.1: strict RFC 8058 one-click", () => {
  const mk = (post: string, url = "https://x.example/u") =>
    parseMime(`From: a@x.com\r\nList-Unsubscribe: <${url}>, <mailto:u@x.com>\r\nList-Unsubscribe-Post: ${post}\r\nSubject: s\r\n\r\nb`).listUnsubscribe;
  it("accepts the exact value, case/space tolerant", () => {
    expect(mk("List-Unsubscribe=One-Click")?.oneClick).toBe(true);
    expect(mk("  list-unsubscribe = one-click ")?.oneClick).toBe(true);
  });
  it("rejects near-misses and http-only URLs", () => {
    expect(mk("List-Unsubscribe=One-Click-Maybe")?.oneClick).toBe(false);
    expect(mk("List-Unsubscribe=One-Click", "http://x.example/u")?.oneClick).toBe(false);
  });
});
