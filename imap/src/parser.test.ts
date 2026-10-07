import { describe, expect, it } from "vitest";
import { ResponseFramer, parseImapResponse, tokString } from "./parser.js";
import type { ImapList } from "./parser.js";

function frameAll(chunks: Buffer[]): Buffer[] {
  const out: Buffer[] = [];
  const f = new ResponseFramer((r) => out.push(r));
  for (const c of chunks) f.push(c);
  return out;
}

const STREAM = Buffer.concat([
  Buffer.from("* 12 FETCH (UID 99 BODY[1] {18}\r\n"),
  Buffer.from("नमस्ते", "utf8"), // 18 bytes, 6 chars
  Buffer.from(" FLAGS (\\Seen))\r\n* 13 EXISTS\r\n"),
  Buffer.from("* 3 FETCH (BODY[HEADER] {0}\r\n UID 7)\r\n"),
  Buffer.from("A1 OK [READ-WRITE] done\r\n"),
]);

describe("ResponseFramer", () => {
  it("frames literals by byte length, never by characters", () => {
    const out = frameAll([STREAM]);
    expect(out.length).toBe(4);
    const r = parseImapResponse(out[0]!);
    const list = (r.attributes[0] as ImapList).value;
    expect(tokString(list[3])).toBe("नमस्ते");
    expect(tokString(list[4])).toBe("FLAGS");
  });

  it("gives identical results when fed one byte at a time (every split point)", () => {
    const whole = frameAll([STREAM]).map((b) => b.toString("hex"));
    const bytes: Buffer[] = [];
    for (let i = 0; i < STREAM.length; i++) bytes.push(STREAM.subarray(i, i + 1));
    expect(frameAll(bytes).map((b) => b.toString("hex"))).toEqual(whole);
    // and every two-way split
    for (let i = 1; i < STREAM.length; i++) {
      const got = frameAll([STREAM.subarray(0, i), STREAM.subarray(i)]).map((b) => b.toString("hex"));
      expect(got).toEqual(whole);
    }
  });

  it("handles CRLF split across chunks and {0} literals", () => {
    const out = frameAll([Buffer.from("* 3 FETCH (BODY[HEADER] {0}\r"), Buffer.from("\n UID 7)\r"), Buffer.from("\n")]);
    expect(out.length).toBe(1);
    const r = parseImapResponse(out[0]!);
    const list = (r.attributes[0] as ImapList).value;
    expect(list[1]!.type).toBe("literal");
    expect((list[1] as { value: Uint8Array }).value.length).toBe(0);
    expect(tokString(list[3])).toBe("7");
  });

  it("handles literal8 ~{n} and non-sync {n+} markers", () => {
    const bin = Buffer.from([0, 1, 2, 13, 10, 255]);
    const raw = Buffer.concat([Buffer.from("* 1 FETCH (BINARY[1] ~{6}\r\n"), bin, Buffer.from(" UID 5)\r\n")]);
    const out = frameAll([raw]);
    const list = (parseImapResponse(out[0]!).attributes[0] as ImapList).value;
    expect(Buffer.from((list[1] as { value: Uint8Array }).value)).toEqual(bin);
    const out2 = frameAll([Buffer.from("* LIST () \"/\" {3+}\r\nabc\r\n")]);
    expect(tokString(parseImapResponse(out2[0]!).attributes[2])).toBe("abc");
  });
});

describe("parseImapResponse", () => {
  it("parses tagged status with code", () => {
    const r = parseImapResponse("A7 NO [TRYCREATE] Mailbox doesn't exist: Foo\r\n");
    expect(r).toMatchObject({ tag: "A7", type: "NO", code: { name: "TRYCREATE", args: [] }, text: "Mailbox doesn't exist: Foo" });
  });

  it("parses code args with lists and \\*", () => {
    const r = parseImapResponse("* OK [PERMANENTFLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft $Forwarded \\*)] Flags permitted.");
    expect(r.code!.name).toBe("PERMANENTFLAGS");
    const l = (r.code!.args[0] as ImapList).value.map(tokString);
    expect(l).toEqual(["\\Answered", "\\Flagged", "\\Deleted", "\\Seen", "\\Draft", "$Forwarded", "\\*"]);
  });

  it("parses continuation", () => {
    expect(parseImapResponse("+ idling\r\n")).toMatchObject({ tag: "+", type: "+", text: "idling" });
    expect(parseImapResponse("+\r\n")).toMatchObject({ tag: "+", text: "" });
  });

  it("keeps BODY[HEADER.FIELDS (A B)]<0> as a single atom", () => {
    const r = parseImapResponse('* 1 FETCH (BODY[HEADER.FIELDS (SUBJECT FROM)]<0> "x" UID 3)');
    const l = (r.attributes[0] as ImapList).value;
    expect(tokString(l[0])).toBe("BODY[HEADER.FIELDS (SUBJECT FROM)]<0>");
    expect(r.number).toBe(1);
    expect(r.type).toBe("FETCH");
  });

  it("decodes quoted escapes and NIL", () => {
    const r = parseImapResponse('* LIST (\\Noselect) NIL "a \\"q\\" \\\\ b"');
    expect(r.attributes[1]).toBeNull();
    expect(tokString(r.attributes[2])).toBe('a "q" \\ b');
  });

  it("parses Gmail [Gmail]/… names and nested lists", () => {
    const r = parseImapResponse('* LIST (\\HasNoChildren \\Sent) "/" "[Gmail]/Sent Mail"');
    expect(tokString(r.attributes[2])).toBe("[Gmail]/Sent Mail");
    const r2 = parseImapResponse("* LIST (\\HasNoChildren) \"/\" [Gmail]/Odd");
    expect(tokString(r2.attributes[2])).toBe("[Gmail]/Odd");
  });

  it("parses untagged SEARCH and ESEARCH-ish lines", () => {
    const r = parseImapResponse("* SEARCH 2 84 882\r\n");
    expect(r.attributes.map(tokString)).toEqual(["2", "84", "882"]);
  });
});
