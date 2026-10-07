/**
 * Interop with @lacspace/mime: the same BODYSTRUCTURE strings (copied from mime's own
 * test fixtures) must produce the shared BodyStructureNode contract field by field.
 */
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseImapResponse } from "./parser.js";
import type { ImapList } from "./parser.js";
import { parseBodyStructure } from "./structures.js";
import type { BodyStructureNode } from "./types.js";

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

const SINGLE_BS = `("TEXT" "PLAIN" ("CHARSET" "windows-1252" "FORMAT" "flowed") NIL NIL "QUOTED-PRINTABLE" 120 3 NIL NIL NIL NIL)`;

/** Run a fixture through the real response parser (as the client would). */
function viaImap(fixture: string): BodyStructureNode {
  const line = fixture.startsWith("*") ? fixture : fixture.startsWith("BODYSTRUCTURE") ? `* 1 FETCH (${fixture})` : `* 1 FETCH (BODYSTRUCTURE ${fixture})`;
  const r = parseImapResponse(line + "\r\n");
  const l = (r.attributes[0] as ImapList).value;
  const i = l.findIndex((t) => t && t.type === "atom" && t.value.toUpperCase() === "BODYSTRUCTURE");
  return parseBodyStructure(l[i + 1])!;
}

const ids = (n: BodyStructureNode): string[] => [n.partId, ...(n.children ?? []).flatMap(ids), ...(n.childNode ? ids(n.childNode) : [])];

const CONTRACT = ["partId", "type", "subtype", "params", "id", "description", "encoding", "size", "lines", "md5", "disposition", "language", "location", "envelope"] as const;

/** Keep only the shared-contract fields (mime adds contentType/filename/isAttachment…). */
function project(n: BodyStructureNode): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of CONTRACT) if (n[k] !== undefined) out[k] = n[k];
  if (n.children) out.children = n.children.map(project);
  if (n.childNode) out.childNode = project(n.childNode);
  return out;
}

describe("BodyStructureNode contract (shared with @lacspace/mime)", () => {
  it("Gmail: partIds, lowercase, Content-ID keeps <>", () => {
    const t = viaImap(GMAIL_BS);
    expect(ids(t)).toEqual(["", "1", "1.1", "1.2", "2"]);
    expect([t.type, t.subtype, t.params]).toEqual(["multipart", "mixed", { boundary: "000000000000efgh" }]);
    const alt = t.children![0]!;
    expect(alt.children![0]).toEqual({ partId: "1.1", type: "text", subtype: "plain", params: { charset: "UTF-8" }, encoding: "quoted-printable", size: 1234, lines: 30 });
    expect(t.children![1]).toEqual({
      partId: "2",
      type: "application",
      subtype: "pdf",
      params: { name: "invoice.pdf" },
      id: "<f_abc123>",
      encoding: "base64",
      size: 40000,
      disposition: { type: "attachment", params: { filename: "invoice.pdf" } },
    });
  });

  it("Dovecot: nested multipart, message/rfc822 with multipart body → childNode P, literal params, RFC 2231", () => {
    const t = viaImap(DOVECOT_BS);
    expect(ids(t)).toEqual(["", "1", "1.1", "1.1.1", "1.1.2", "1.2", "2", "2", "2.1", "2.2", "3"]);
    const related = t.children![0]!;
    expect(related.params).toEqual({ boundary: "b1", type: "multipart/alternative" });
    expect(related.children![1]).toMatchObject({ partId: "1.2", id: "<logo@x>", disposition: { type: "inline", params: { filename: "logo.png" } } });
    const msg = t.children![1]!;
    expect(msg).toMatchObject({ partId: "2", type: "message", subtype: "rfc822", encoding: "7bit", size: 900, lines: 30 });
    expect(Array.isArray(msg.envelope)).toBe(true);
    expect((msg.envelope as unknown[])[1]).toBe(`Inner "quoted"`);
    expect((msg.envelope as unknown[])[2]).toEqual([["A", null, "a", "x.com"]]);
    expect(msg.disposition).toEqual({ type: "attachment", params: { filename: "fwd.eml" } });
    expect(msg.childNode!.partId).toBe("2");
    expect(msg.childNode!.children![1]!.disposition!.params.filename).toBe("写真.jpg");
    const xls = t.children![2]!;
    expect(xls).toMatchObject({
      partId: "3",
      params: { name: "report Q3.xls" },
      disposition: { type: "attachment", params: { filename: "very long name.xls" } },
      language: ["en", "ne"],
      location: "https://x.io/r",
    });
  });

  it("Exchange: uppercase normalised, single-part rfc822 body → childNode P.1, disposition params lowercased", () => {
    const t = viaImap(EXCHANGE_BS);
    expect(ids(t)).toEqual(["", "1", "2", "2.1"]);
    expect(t.language).toEqual(["en-US"]);
    expect(t.children![0]!.language).toEqual(["en-US"]);
    const msg = t.children![1]!;
    expect(msg.params).toEqual({ name: "Fwd.eml" });
    expect(msg.disposition).toEqual({ type: "attachment", params: { filename: "Fwd.eml", size: "800", "creation-date": "Tue, 01 Oct 2024 10:00:00 GMT" } });
    expect(msg.childNode).toEqual({ partId: "2.1", type: "text", subtype: "plain", params: { charset: "us-ascii" }, encoding: "7bit", size: 100, lines: 4 });
  });

  it("single-part root is partId 1", () => {
    expect(viaImap(SINGLE_BS)).toEqual({
      partId: "1",
      type: "text",
      subtype: "plain",
      params: { charset: "windows-1252", format: "flowed" },
      encoding: "quoted-printable",
      size: 120,
      lines: 3,
    });
  });

  // Cross-check against the real @lacspace/mime parser when the sibling package is present.
  const mimeSrc = fileURLToPath(new URL("../../mime/src/bodystructure.ts", import.meta.url));
  it.runIf(existsSync(mimeSrc))("matches @lacspace/mime parseBodyStructure field by field", async () => {
    const mime = (await import(/* @vite-ignore */ mimeSrc)) as { parseBodyStructure(s: string): BodyStructureNode };
    for (const fx of [GMAIL_BS, DOVECOT_BS, EXCHANGE_BS, SINGLE_BS]) {
      expect(project(viaImap(fx))).toEqual(project(mime.parseBodyStructure(fx)));
    }
  });
});
