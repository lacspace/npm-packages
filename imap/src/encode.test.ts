import { describe, expect, it } from "vitest";
import { buildSearch, expandSequenceSet, joinArgs, parseInternalDate, sortUidsDesc, uidRange } from "./encode.js";
import { decodeModifiedUtf7, encodeModifiedUtf7 } from "./utf7.js";
import { decodeParams, decodeWords } from "./rfc2047.js";

const render = (s: ReturnType<typeof buildSearch>) =>
  joinArgs(s.args)
    .map((a) => (typeof a === "string" ? a : `{${a.length}}` + Buffer.from(a).toString("utf8")))
    .join("");

describe("modified UTF-7", () => {
  it.each([
    ["INBOX", "INBOX"],
    ["Sent & Received", "Sent &- Received"],
    ["~peter/mail/台北/日本語", "~peter/mail/&U,BTFw-/&ZeVnLIqe-"],
    ["Отправленные", "&BB4EQgQ,BEAEMAQyBDsENQQ9BD0ESwQ1-"],
    ["Entwürfe", "Entw&APw-rfe"],
    ["📧 Mail", "&2D3c5w- Mail"],
  ])("%s ⇄ %s", (plain, enc) => {
    expect(encodeModifiedUtf7(plain)).toBe(enc);
    expect(decodeModifiedUtf7(enc)).toBe(plain);
  });
});

describe("uidRange / sequence sets", () => {
  it("compacts", () => {
    expect(uidRange([1, 2, 3, 4, 5, 9, 12, 13, 14, 15, 16, 17, 18, 19, 20])).toBe("1:5,9,12:20");
    expect(uidRange([20, 3, 3, 1, 2])).toBe("1:3,20");
    expect(uidRange([7])).toBe("7");
    expect(uidRange([])).toBe("");
  });
  it("expands", () => {
    expect(expandSequenceSet("1:3,7,10:9")).toEqual([1, 2, 3, 7, 9, 10]);
  });
  it("sorts newest first", () => {
    expect(sortUidsDesc([3, 10, 1])).toEqual([10, 3, 1]);
  });
});

describe("buildSearch", () => {
  it("defaults to ALL", () => {
    expect(render(buildSearch({}))).toBe("ALL");
  });
  it("encodes flags, dates and strings", () => {
    const s = buildSearch({ unseen: true, flagged: false, since: new Date(Date.UTC(2026, 9, 1)), from: 'a"b\\c', larger: 1000 });
    expect(render(s)).toBe('UNSEEN UNFLAGGED SINCE 1-Oct-2026 FROM "a\\"b\\\\c" LARGER 1000');
    expect(s.charset).toBeNull();
  });
  it("uses CHARSET UTF-8 + literal for non-ASCII", () => {
    const s = buildSearch({ subject: "नमस्ते" });
    expect(s.charset).toBe("UTF-8");
    expect(s.args[1]).toBeInstanceOf(Uint8Array);
    expect((s.args[1] as Uint8Array).length).toBe(18);
  });
  it("groups OR / NOT and headers / uid", () => {
    const s = buildSearch({ or: [{ from: "x@y" }, { to: "x@y", seen: true }], not: { deleted: true }, header: [["X-Id", "1"]], uid: [1, 2, 3, 9] });
    expect(render(s)).toBe('HEADER X-Id "1" UID 1:3,9 OR (FROM "x@y") (SEEN TO "x@y") NOT DELETED');
  });
  it("rejects header names with spaces", () => {
    expect(() => buildSearch({ header: [["X Bad", "1"]] })).toThrow();
  });
});

describe("dates", () => {
  it("parses INTERNALDATE with zone", () => {
    expect(parseInternalDate("17-Jul-1996 02:44:25 -0700")!.toISOString()).toBe("1996-07-17T09:44:25.000Z");
    expect(parseInternalDate(" 7-Oct-2026 10:00:00 +0545")!.toISOString()).toBe("2026-10-07T04:15:00.000Z");
  });
});

describe("RFC 2047 / 2231", () => {
  it("decodes and joins adjacent encoded words", () => {
    expect(decodeWords("=?UTF-8?B?4KSo4KSu4KS44KWN?= =?UTF-8?B?4KSk4KWH?=")).toBe("नमस्ते");
    expect(decodeWords("Re: =?iso-8859-1?Q?caf=E9_cr=E8me?= ok")).toBe("Re: café crème ok");
    expect(decodeWords("plain")).toBe("plain");
  });
  it("decodes RFC 2231 continuations + charset", () => {
    expect(
      decodeParams([
        ["FILENAME*0*", "utf-8''%E0%A4%A8%E0%A4"],
        ["filename*1*", "%AE.pdf"],
        ["NAME", "=?utf-8?Q?r=C3=A9sum=C3=A9.pdf?="],
      ]),
    ).toEqual({ filename: "नम.pdf", name: "résumé.pdf" });
  });
});
