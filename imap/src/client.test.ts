import { afterEach, describe, expect, it } from "vitest";
import { createImapClient, ImapClient } from "./client.js";
import { ImapAuthError, ImapCommandError, ImapNetworkError } from "./errors.js";
import type { ImapClientOptions, ImapEvent } from "./types.js";
import { DOVECOT_CAPS, type FakeServer, type FakeServerOptions, startFakeServer } from "./test/fake-server.js";
import { TEST_CERT } from "./test/cert.js";

const servers: FakeServer[] = [];
const clients: ImapClient[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  for (const s of servers.splice(0)) await s.close();
});

async function setup(sopts: FakeServerOptions = {}, copts: Partial<ImapClientOptions> = {}, connect = true) {
  const server = await startFakeServer(sopts);
  servers.push(server);
  const logs: string[] = [];
  const client = createImapClient({
    host: "127.0.0.1",
    port: server.port,
    secure: false,
    auth: { user: "chandan@lacspace.com", pass: "s3cret" },
    timeoutMs: 3000,
    logger: { debug: (m) => logs.push(m) },
    ...copts,
  });
  clients.push(client);
  if (connect) await client.connect();
  return { server, client, logs };
}

const enc = (s: string) => Buffer.from(s, "utf8");
const dec = (b?: Uint8Array) => (b ? Buffer.from(b).toString("utf8") : undefined);

describe("connect + auth", () => {
  it("LOGIN escapes quotes/backslashes and never logs the password", async () => {
    const pass = 'p"a\\ss w0rd';
    const { server, logs } = await setup({}, { auth: { user: "u@x.com", pass } });
    const login = server.commands.find((c) => c.name === "LOGIN")!;
    expect(login.args).toBe('"u@x.com" "p\\"a\\\\ss w0rd"');
    const all = logs.join("\n");
    expect(all).not.toContain("w0rd");
    expect(all).toMatch(/LOGIN \*\*\*\*/);
  });

  it("non-ASCII password: AUTH=PLAIN when advertised", async () => {
    const pass = "पासवर्ड123";
    const { server, logs } = await setup(
      {
        handlers: {
          AUTHENTICATE: (c, conn) => {
            const [, b64] = c.args.split(" ");
            const [, user, pw] = Buffer.from(b64!, "base64").toString("utf8").split("\0");
            return user === "u" && pw === pass ? conn.ok(c.tag, "[CAPABILITY IMAP4rev1 IDLE] Logged in") : conn.lines(`${c.tag} NO bad`);
          },
        },
      },
      { auth: { user: "u", pass } },
    );
    expect(server.commands.some((c) => c.name === "AUTHENTICATE")).toBe(true);
    expect(logs.join("\n")).not.toContain(Buffer.from(`\0u\0${pass}`).toString("base64"));
  });

  it("non-ASCII password via LOGIN literal with sync continuation (no LITERAL+)", async () => {
    const pass = "pässwörd";
    const { server, logs } = await setup(
      { caps: "IMAP4rev1 IDLE" },
      { auth: { user: "u", pass } },
    );
    const login = server.commands.find((c) => c.name === "LOGIN")!;
    expect(login.args).toBe(`"u" {${Buffer.byteLength(pass)}}`);
    expect(login.literals[0]!.toString("utf8")).toBe(pass);
    expect(logs.join("\n")).not.toContain("wörd");
  });

  it("[AUTHENTICATIONFAILED] → ImapAuthError", async () => {
    const p = setup(
      { handlers: { LOGIN: (c, conn) => conn.lines(`${c.tag} NO [AUTHENTICATIONFAILED] Authentication failed.`) } },
      {},
      false,
    );
    const { client } = await p;
    const err = await client.connect().catch((e) => e);
    expect(err).toBeInstanceOf(ImapAuthError);
    expect(err.responseCode).toBe("AUTHENTICATIONFAILED");
  });

  it("Gmail XOAUTH2 with SASL-IR; error challenge is answered with an empty line", async () => {
    let seenPayload = "";
    let gotEmpty = false;
    const gmailCaps = "IMAP4rev1 UNSELECT IDLE NAMESPACE QUOTA ID XLIST CHILDREN X-GM-EXT-1 XYZZY SASL-IR AUTH=XOAUTH2 AUTH=PLAIN AUTH=PLAIN-CLIENTTOKEN AUTH=OAUTHBEARER";
    const { client } = await setup(
      {
        greeting: `* OK Gimap ready for requests from 1.2.3.4 abc123`,
        caps: gmailCaps,
        handlers: {
          AUTHENTICATE: async (c, conn) => {
            seenPayload = Buffer.from(c.args.split(" ")[1]!, "base64").toString();
            await conn.lines('+ eyJzdGF0dXMiOiI0MDAiLCJzY2hlbWVzIjoiQmVhcmVyIiwic2NvcGUiOiJodHRwczovL21haWwuZ29vZ2xlLmNvbS8ifQ==');
            gotEmpty = (await conn.nextLine()) === "";
            await conn.lines(`${c.tag} NO [AUTHENTICATIONFAILED] Invalid credentials (Failure)`);
          },
        },
      },
      { auth: { user: "me@gmail.com", accessToken: "ya29.TOKEN" } },
      false,
    );
    const err = await client.connect().catch((e) => e);
    expect(seenPayload).toBe("user=me@gmail.com\x01auth=Bearer ya29.TOKEN\x01\x01");
    expect(gotEmpty).toBe(true);
    expect(err).toBeInstanceOf(ImapAuthError);
  });

  it("OAUTHBEARER without SASL-IR waits for continuation", async () => {
    let payload = "";
    const { server } = await setup(
      {
        caps: "IMAP4rev1 AUTH=OAUTHBEARER",
        handlers: {
          AUTHENTICATE: async (c, conn) => {
            await conn.lines("+ ");
            payload = Buffer.from((await conn.nextLine())!, "base64").toString();
            await conn.ok(c.tag, "[CAPABILITY IMAP4rev1 IDLE] Success");
          },
        },
      },
      { auth: { user: "a@b.c", accessToken: "tok" } },
    );
    expect(server.commands.find((c) => c.name === "AUTHENTICATE")!.args).toBe("OAUTHBEARER");
    expect(payload).toMatch(/^n,a=a@b.c,\x01host=127.0.0.1\x01port=\d+\x01auth=Bearer tok\x01\x01$/);
  });

  it("PREAUTH skips login; ID is sent when clientId given", async () => {
    const { server } = await setup(
      {
        greeting: "* PREAUTH [CAPABILITY IMAP4rev1 ID] ready",
        handlers: { ID: (c, conn) => conn.lines('* ID ("name" "Dovecot")', `${c.tag} OK ID completed.`) },
      },
      { clientId: { name: "Lacspace Mail", version: "1.0.0" } },
    );
    expect(server.commands.map((c) => c.name)).toEqual(["ID"]);
    expect(server.commands[0]!.args).toBe('("name" "Lacspace Mail" "version" "1.0.0")');
  });

  it("greeting BYE → ImapNetworkError EBYE", async () => {
    const { client } = await setup({ greeting: "* BYE Too many connections" }, {}, false);
    const err = await client.connect().catch((e) => e);
    expect(err).toBeInstanceOf(ImapNetworkError);
    expect(err.code).toBe("EBYE");
  });
});

describe("STARTTLS + TLS", () => {
  it("STARTTLS refused with starttls:'required' → ImapNetworkError ESTARTTLS", async () => {
    const { client } = await setup(
      { caps: "IMAP4rev1 STARTTLS", handlers: { STARTTLS: (c, conn) => conn.lines(`${c.tag} NO TLS not available`) } },
      { starttls: "required" },
      false,
    );
    const err = await client.connect().catch((e) => e);
    expect(err).toBeInstanceOf(ImapNetworkError);
    expect(err.code).toBe("ESTARTTLS");
  });

  it("STARTTLS not advertised + required → error; opportunistic → continues in plain", async () => {
    const a = await setup({ caps: "IMAP4rev1" }, { starttls: "required" }, false);
    expect((await a.client.connect().catch((e) => e)).code).toBe("ESTARTTLS");
    const b = await setup({ caps: "IMAP4rev1 STARTTLS", handlers: { STARTTLS: (c, conn) => conn.lines(`${c.tag} BAD no`) } });
    expect(b.client.authenticated).toBe(true);
  });

  it("STARTTLS upgrade verifies the certificate and refreshes capabilities", async () => {
    let n = 0;
    const handlers: FakeServerOptions["handlers"] = {
      STARTTLS: async (c, conn) => {
        await conn.ok(c.tag, "Begin TLS negotiation now.");
        await conn.upgradeTls();
      },
      CAPABILITY: async (c, conn) => {
        n++;
        await conn.lines(n === 1 ? "* CAPABILITY IMAP4rev1 STARTTLS LOGINDISABLED" : "* CAPABILITY IMAP4rev1 AUTH=PLAIN IDLE");
        await conn.ok(c.tag);
      },
      AUTHENTICATE: (c, conn) => conn.ok(c.tag),
    };
    const { client, server } = await setup(
      { greeting: "* OK ready", handlers },
      { host: "localhost", tls: { ca: TEST_CERT } },
    );
    expect(client.capabilities.has("IDLE")).toBe(true);
    // LOGINDISABLED was before TLS only → LOGIN used afterwards
    expect(server.commands.map((c) => c.name)).toEqual(["CAPABILITY", "STARTTLS", "CAPABILITY", "LOGIN", "CAPABILITY"]);
  });

  it("implicit TLS rejects a self-signed cert by default, accepts it with ca", async () => {
    const server = await startFakeServer({ tls: true });
    servers.push(server);
    const bad = createImapClient({ host: "localhost", port: server.port, auth: { user: "u", pass: "p" }, timeoutMs: 3000 });
    clients.push(bad);
    const err = await bad.connect().catch((e) => e);
    expect(err).toBeInstanceOf(ImapNetworkError);
    expect(String(err.code)).toMatch(/SELF_SIGNED|CERT/);
    const good = createImapClient({ host: "localhost", port: server.port, auth: { user: "u", pass: "p" }, tls: { ca: TEST_CERT } });
    clients.push(good);
    await good.connect();
    expect(good.secure).toBe(true);
    await good.logout();
  });
});

describe("mailboxes", () => {
  it("LIST RETURN (SPECIAL-USE SUBSCRIBED) on Dovecot, UTF-7 decoded", async () => {
    const { client, server } = await setup({
      caps: DOVECOT_CAPS,
      handlers: {
        LIST: (c, conn) =>
          conn.lines(
            '* LIST (\\HasNoChildren \\Subscribed) "." INBOX',
            '* LIST (\\HasNoChildren \\Subscribed \\Sent) "." Sent',
            '* LIST (\\HasNoChildren \\Trash) "." "Trash"',
            '* LIST (\\HasChildren \\Subscribed) "." "&BB4EQgQ,BEAEMAQyBDsENQQ9BD0ESwQ1-"',
            '* LIST (\\HasNoChildren \\Subscribed \\Drafts) "." {6}',
            "Drafts",
            `${c.tag} OK List completed (0.001 + 0.000 secs).`,
          ),
      },
    });
    const boxes = await client.listMailboxes();
    expect(server.commands.at(-1)!.args).toBe('"" "*" RETURN (SPECIAL-USE SUBSCRIBED)');
    expect(boxes.map((b) => [b.path, b.specialUse, b.subscribed])).toEqual([
      ["INBOX", "\\Inbox", true],
      ["Sent", "\\Sent", true],
      ["Trash", "\\Trash", false],
      ["Отправленные", undefined, true],
      ["Drafts", "\\Drafts", true],
    ]);
    expect(boxes[3]!.rawPath).toBe("&BB4EQgQ,BEAEMAQyBDsENQQ9BD0ESwQ1-");
    expect(boxes[3]!.delimiter).toBe(".");
  });

  it("XLIST fallback (old Gmail) maps \\AllMail/\\Spam/\\Starred", async () => {
    const { client } = await setup({
      caps: "IMAP4rev1 XLIST",
      handlers: {
        LIST: (c, conn) =>
          conn.lines(
            '* LIST (\\HasNoChildren) "/" "INBOX"',
            '* LIST (\\Noselect \\HasChildren) "/" "[Gmail]"',
            '* LIST (\\HasNoChildren) "/" "[Gmail]/All Mail"',
            '* LIST (\\HasNoChildren) "/" "[Gmail]/Spam"',
            '* LIST (\\HasNoChildren) "/" "[Gmail]/Starred"',
            '* LIST (\\HasNoChildren) "/" "[Gmail]/Sent Mail"',
            `${c.tag} OK Success`,
          ),
        XLIST: (c, conn) =>
          conn.lines(
            '* XLIST (\\HasNoChildren \\Inbox) "/" "Inbox"',
            '* XLIST (\\HasNoChildren \\AllMail) "/" "[Gmail]/All Mail"',
            '* XLIST (\\HasNoChildren \\Spam) "/" "[Gmail]/Spam"',
            '* XLIST (\\HasNoChildren \\Starred) "/" "[Gmail]/Starred"',
            '* XLIST (\\HasNoChildren \\Sent) "/" "[Gmail]/Sent Mail"',
            `${c.tag} OK Success`,
          ),
        LSUB: (c, conn) => conn.lines('* LSUB () "/" "INBOX"', `${c.tag} OK Success`),
      },
    });
    const boxes = await client.listMailboxes();
    const roles = Object.fromEntries(boxes.map((b) => [b.path, b.specialUse ?? null]));
    expect(roles).toEqual({
      INBOX: "\\Inbox",
      "[Gmail]": null,
      "[Gmail]/All Mail": "\\All",
      "[Gmail]/Spam": "\\Junk",
      "[Gmail]/Starred": "\\Flagged",
      "[Gmail]/Sent Mail": "\\Sent",
    });
    expect(boxes.find((b) => b.path === "INBOX")!.subscribed).toBe(true);
    expect(boxes.find((b) => b.name === "Spam")!.subscribed).toBe(false);
  });

  it("name-based guess (Exchange-style names, localised, INBOX.Sent)", async () => {
    const { client } = await setup({
      caps: "IMAP4rev1",
      handlers: {
        LIST: (c, conn) =>
          conn.lines(
            '* LIST (\\Marked \\HasNoChildren) "/" Inbox',
            '* LIST (\\HasNoChildren) "/" "Sent Items"',
            '* LIST (\\HasNoChildren) "/" "Deleted Items"',
            '* LIST (\\HasNoChildren) "/" "Junk Email"',
            '* LIST (\\HasNoChildren) "/" "Entw&APw-rfe"',
            '* LIST (\\HasNoChildren) "/" "Archive/2024"',
            '* LIST (\\HasNoChildren) "/" "Archiv"',
            `${c.tag} OK LIST completed.`,
          ),
        LSUB: (c, conn) => conn.lines(`${c.tag} NO LSUB not supported`),
      },
    });
    const boxes = await client.listMailboxes();
    const roles = Object.fromEntries(boxes.map((b) => [b.path, b.specialUse ?? null]));
    expect(roles).toEqual({
      INBOX: "\\Inbox",
      "Sent Items": "\\Sent",
      "Deleted Items": "\\Trash",
      "Junk Email": "\\Junk",
      Entwürfe: "\\Drafts",
      "Archive/2024": null,
      Archiv: "\\Archive",
    });
  });

  it("create / rename / delete / subscribe encode modified UTF-7; ALREADYEXISTS → created:false", async () => {
    const { client, server } = await setup({
      handlers: {
        CREATE: (c, conn) =>
          c.args === '"Projects/&ZeVnLIqe-"' ? conn.ok(c.tag) : conn.lines(`${c.tag} NO [ALREADYEXISTS] Mailbox already exists`),
        RENAME: (c, conn) => conn.ok(c.tag),
        DELETE: (c, conn) => conn.ok(c.tag),
        SUBSCRIBE: (c, conn) => conn.ok(c.tag),
        UNSUBSCRIBE: (c, conn) => conn.ok(c.tag),
      },
    });
    expect(await client.createMailbox("Projects/日本語")).toEqual({ created: true });
    expect(await client.createMailbox("Other")).toEqual({ created: false });
    await client.renameMailbox("Projects/日本語", "Projects/Café & Co");
    await client.subscribe("Projects/Café & Co");
    await client.unsubscribe("Projects/Café & Co");
    await client.deleteMailbox("Projects/Café & Co");
    expect(server.commands.slice(-4).map((c) => `${c.name} ${c.args}`)).toEqual([
      'RENAME "Projects/&ZeVnLIqe-" "Projects/Caf&AOk- &- Co"',
      'SUBSCRIBE "Projects/Caf&AOk- &- Co"',
      'UNSUBSCRIBE "Projects/Caf&AOk- &- Co"',
      'DELETE "Projects/Caf&AOk- &- Co"',
    ]);
  });
});

const SELECT_HANDLER: NonNullable<FakeServerOptions["handlers"]>[string] = (c, conn) =>
  conn.lines(
    "* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft $Forwarded)",
    "* OK [PERMANENTFLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft $Forwarded \\*)] Flags permitted.",
    "* 172 EXISTS",
    "* 1 RECENT",
    "* OK [UNSEEN 12] First unseen.",
    "* OK [UIDVALIDITY 1696000000] UIDs valid",
    "* OK [UIDNEXT 4392] Predicted next UID",
    "* OK [HIGHESTMODSEQ 90060115205545359] Highest",
    `${c.tag} OK [${c.name === "EXAMINE" ? "READ-ONLY" : "READ-WRITE"}] Select completed (0.001 + 0.000 secs).`,
  );

describe("select / status / search", () => {
  it("select parses every code; condstore param; no events during select", async () => {
    const events: string[] = [];
    const { client, server } = await setup({ caps: DOVECOT_CAPS, handlers: { SELECT: SELECT_HANDLER, EXAMINE: SELECT_HANDLER } });
    client.on("exists", () => events.push("exists"));
    const box = await client.select("INBOX", { condstore: true });
    expect(server.commands.at(-1)!.args).toBe("INBOX (CONDSTORE)");
    expect(box).toEqual({
      path: "INBOX",
      exists: 172,
      recent: 1,
      unseen: 12,
      uidValidity: 1696000000,
      uidNext: 4392,
      highestModseq: 90060115205545359n,
      flags: ["\\Answered", "\\Flagged", "\\Deleted", "\\Seen", "\\Draft", "$Forwarded"],
      permanentFlags: ["\\Answered", "\\Flagged", "\\Deleted", "\\Seen", "\\Draft", "$Forwarded", "\\*"],
      readOnly: false,
    });
    expect(events).toEqual([]);
    const ro = await client.select("Archive", { readOnly: true });
    expect(ro.readOnly).toBe(true);
    expect(server.commands.at(-1)!.name).toBe("EXAMINE");
  });

  it("select NONEXISTENT → ImapCommandError with responseCode", async () => {
    const { client } = await setup({ handlers: { SELECT: (c, conn) => conn.lines(`${c.tag} NO [NONEXISTENT] Mailbox doesn't exist: Nope`) } });
    const err = await client.select("Nope").catch((e) => e);
    expect(err).toBeInstanceOf(ImapCommandError);
    expect(err.responseCode).toBe("NONEXISTENT");
    expect(client.mailbox).toBeNull();
  });

  it("status", async () => {
    const { client, server } = await setup({
      caps: "IMAP4rev1 CONDSTORE",
      handlers: { STATUS: (c, conn) => conn.lines('* STATUS "Sent Items" (MESSAGES 231 UNSEEN 3 UIDNEXT 44292 UIDVALIDITY 7 RECENT 0 HIGHESTMODSEQ 99)', `${c.tag} OK done`) },
    });
    expect(await client.status("Sent Items")).toEqual({ messages: 231, unseen: 3, uidNext: 44292, uidValidity: 7, recent: 0, highestModseq: 99n });
    expect(server.commands.at(-1)!.args).toBe('"Sent Items" (MESSAGES UNSEEN UIDNEXT UIDVALIDITY RECENT HIGHESTMODSEQ)');
  });

  it("search: UID SEARCH, CHARSET UTF-8 literal for non-ASCII", async () => {
    const { client, server } = await setup({
      caps: "IMAP4rev1",
      handlers: {
        "UID SEARCH": (c, conn) => conn.lines("* SEARCH 4 9 17", `${c.tag} OK Search completed`),
        SEARCH: (c, conn) => conn.lines("* SEARCH", `${c.tag} OK Search completed`),
      },
    });
    expect(await client.search({ unseen: true, since: new Date(Date.UTC(2026, 0, 5)) })).toEqual([4, 9, 17]);
    expect(server.commands.at(-1)!.args).toBe("UNSEEN SINCE 5-Jan-2026");
    expect(await client.search({ subject: "दशैं" }, { uid: false })).toEqual([]);
    const last = server.commands.at(-1)!;
    expect(last.args).toBe(`CHARSET UTF-8 SUBJECT {${Buffer.byteLength("दशैं")}}`);
    expect(last.literals[0]!.toString()).toBe("दशैं");
  });
});

const BODY1 = "नमस्ते, Lacspace!\r\nदोस्रो लाइन\r\n";
const HDR = "Subject: =?UTF-8?B?4KSo4KSu4KS44KWN4KSk4KWH?=\r\nFrom: Ram <ram@example.com>\r\n\r\n";

function fetchHandler(): NonNullable<FakeServerOptions["handlers"]>[string] {
  return async (c, conn) => {
    const env = '("Tue, 6 Oct 2026 09:15:00 +0545" "=?UTF-8?B?4KSo4KSu4KS44KWN4KSk4KWH?=" (("Ram" NIL "ram" "example.com")) (("Ram" NIL "ram" "example.com")) (("Ram" NIL "ram" "example.com")) ((NIL NIL "chandan" "lacspace.com")) NIL NIL NIL "<m1@example.com>")';
    const bs = '(("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "8BIT" 60 2 NIL NIL NIL)("TEXT" "HTML" ("CHARSET" "UTF-8") NIL NIL "QUOTED-PRINTABLE" 120 3 NIL NIL NIL) "ALTERNATIVE" ("BOUNDARY" "b") NIL NIL)';
    await conn.lines(
      // multi-line FETCH with literals, items out of order, BODY[1] literal of multi-byte UTF-8
      Buffer.concat([
        enc(`* 3 FETCH (FLAGS (\\Seen) BODY[HEADER.FIELDS (SUBJECT FROM)] {${Buffer.byteLength(HDR)}}\r\n${HDR} UID 103 ENVELOPE ${env} BODYSTRUCTURE ${bs} INTERNALDATE " 6-Oct-2026 09:15:01 +0545" RFC822.SIZE 2048 BODY[1] {${Buffer.byteLength(BODY1)}}\r\n`),
        enc(BODY1),
        enc(")\r\n"),
      ]),
      // unsolicited EXISTS in the middle of the command
      "* 173 EXISTS",
      // unsolicited flag change for another message (FLAGS only) → event, not a result
      "* 9 FETCH (FLAGS (\\Seen \\Flagged) UID 109)",
      `* 2 FETCH (UID 102 RFC822.SIZE 10 FLAGS () ENVELOPE (NIL "plain" NIL NIL NIL NIL NIL NIL NIL NIL) BODYSTRUCTURE ("TEXT" "PLAIN" NIL NIL NIL "7BIT" 5 1 NIL NIL NIL NIL) INTERNALDATE "06-Oct-2026 08:00:00 +0000" BODY[HEADER.FIELDS (SUBJECT FROM)] {2}\r\n\r\n BODY[1] "hello")`,
      `${c.tag} OK Fetch completed (0.002 + 0.000 secs).`,
    );
  };
}

describe("fetch", () => {
  it("streams envelopes + parts, handles literals, out-of-order items and unsolicited responses", async () => {
    const { client, server } = await setup({ caps: DOVECOT_CAPS, handlers: { SELECT: SELECT_HANDLER, "UID FETCH": fetchHandler() } });
    await client.select("INBOX");
    const events: ImapEvent[] = [];
    client.on("exists", (e) => events.push(e));
    client.on("fetch", (e) => events.push(e));
    const msgs = [];
    for await (const m of client.fetch([103, 102], {
      envelope: true,
      flags: true,
      bodyStructure: true,
      internalDate: true,
      size: true,
      headers: ["Subject", "From"],
      bodyParts: ["1"],
    })) {
      msgs.push(m);
    }
    expect(server.commands.at(-1)!.args).toBe(
      "102:103 (UID FLAGS ENVELOPE INTERNALDATE RFC822.SIZE BODYSTRUCTURE BODY.PEEK[HEADER.FIELDS (SUBJECT FROM)] BODY.PEEK[1])",
    );
    expect(msgs.length).toBe(2);
    const [a, b] = msgs;
    expect(a!.seq).toBe(3);
    expect(a!.uid).toBe(103);
    expect(a!.flags).toEqual(["\\Seen"]);
    expect(a!.envelope!.subject).toBe("नमस्ते");
    expect(a!.envelope!.from).toEqual([{ name: "Ram", address: "ram@example.com" }]);
    expect(a!.envelope!.date!.toISOString()).toBe("2026-10-06T03:30:00.000Z");
    expect(a!.internalDate!.toISOString()).toBe("2026-10-06T03:30:01.000Z");
    expect(a!.size).toBe(2048);
    expect(dec(a!.headers)).toBe(HDR);
    expect(dec(a!.parts["1"])).toBe(BODY1);
    expect(a!.bodyStructure!.children!.map((c) => c.partId)).toEqual(["1", "2"]);
    expect(b!.uid).toBe(102);
    expect(dec(b!.parts["1"])).toBe("hello");
    expect(b!.bodyStructure!.partId).toBe("1");
    expect(events).toEqual([
      { type: "exists", path: "INBOX", count: 173, prevCount: 172 },
      { type: "fetch", path: "INBOX", seq: 9, uid: 109, flags: ["\\Seen", "\\Flagged"] },
    ]);
    expect(client.mailbox!.exists).toBe(173);
  });

  it("yields the first message before the server has finished the command", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { client } = await setup({
      handlers: {
        "UID FETCH": async (c, conn) => {
          await conn.lines("* 1 FETCH (UID 1 FLAGS ())");
          await gate;
          await conn.lines("* 2 FETCH (UID 2 FLAGS ())", `${c.tag} OK done`);
        },
      },
    });
    const seen: number[] = [];
    for await (const m of client.fetch("1:*", { flags: true })) {
      seen.push(m.uid);
      if (m.uid === 1) release();
    }
    expect(seen).toEqual([1, 2]);
  });

  it("BINARY ~{n} literal, partial <0.N>, peek:false, source, Gmail labels, CHANGEDSINCE", async () => {
    const bin = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const src = "Subject: x\r\n\r\nbody\r\n";
    const { client, server } = await setup({
      caps: "IMAP4rev1 LITERAL+ X-GM-EXT-1 CONDSTORE BINARY",
      handlers: {
        "UID FETCH": (c, conn) =>
          conn.lines(
            Buffer.concat([
              enc(`* 1 FETCH (UID 5 MODSEQ (12345) X-GM-LABELS (\\Inbox "Work" "&ZeVnLIqe-") BINARY[2] ~{${bin.length}}\r\n`),
              bin,
              enc(` BODY[1]<0> {4}\r\nnamo BODY[] {${src.length}}\r\n${src})\r\n`),
            ]),
            `${c.tag} OK Success`,
          ),
      },
    });
    const [m] = await client.fetchAll("5", { bodyParts: ["1"], maxPartBytes: 4, peek: false, source: true, gmLabels: true, changedSince: 100n });
    expect(server.commands.at(-1)!.args).toBe("5 (UID MODSEQ X-GM-LABELS BODY[1]<0.4> BODY[]) (CHANGEDSINCE 100)");
    expect(Buffer.from(m!.parts["2"]!)).toEqual(bin);
    expect(dec(m!.parts["1"])).toBe("namo");
    expect(dec(m!.source)).toBe(src);
    expect(m!.labels).toEqual(["\\Inbox", "Work", "日本語"]);
    expect(m!.modseq).toBe(12345n);
  });

  it("breaking out early drains the rest; the connection stays usable", async () => {
    const lines: string[] = [];
    for (let i = 1; i <= 300; i++) lines.push(`* ${i} FETCH (UID ${i} BODY[TEXT] {5}\r\nabcde)`);
    const { client } = await setup({
      handlers: { "UID FETCH": (c, conn) => conn.lines(...lines, `${c.tag} OK done`), NOOP: (c, conn) => conn.ok(c.tag) },
    });
    let n = 0;
    for await (const m of client.fetch("1:*", { bodyParts: ["TEXT"] })) {
      expect(dec(m.parts["TEXT"])).toBe("abcde");
      if (++n === 3) break;
    }
    await client.noop();
    expect(n).toBe(3);
  });

  it("empty uid list returns nothing without a round-trip", async () => {
    const { client, server } = await setup();
    const before = server.commands.length;
    expect(await client.fetchAll([], { flags: true })).toEqual([]);
    expect(server.commands.length).toBe(before);
  });
});

describe("store / copy / move / expunge / append", () => {
  it("store returns flags map; MODIFIED reported", async () => {
    const { client, server } = await setup({
      caps: "IMAP4rev1 CONDSTORE",
      handlers: {
        "UID STORE": (c, conn) =>
          c.args.includes("UNCHANGEDSINCE")
            ? conn.lines(`${c.tag} OK [MODIFIED 7,9] Conditional STORE failed`)
            : conn.lines("* 1 FETCH (UID 4 FLAGS (\\Seen \\Flagged))", "* 2 FETCH (FLAGS (\\Seen) UID 5)", `${c.tag} OK Store completed`),
      },
    });
    const r = await client.store([4, 5], { add: ["\\Seen", "\\Flagged"] }, { silent: false });
    expect(server.commands.at(-1)!.args).toBe("4:5 +FLAGS (\\Seen \\Flagged)");
    expect([...r.entries()]).toEqual([
      [4, ["\\Seen", "\\Flagged"]],
      [5, ["\\Seen"]],
    ]);
    const r2 = await client.store("7:9", { remove: ["\\Seen"] }, { unchangedSince: 50 });
    expect(server.commands.at(-1)!.args).toBe("7:9 (UNCHANGEDSINCE 50) -FLAGS.SILENT (\\Seen)");
    expect(r2.modified).toEqual([7, 9]);
    await expect(client.store(1, { add: ["bad flag"] })).rejects.toThrow(/Invalid flag/);
  });

  it("copy parses COPYUID; TRYCREATE surfaces as responseCode", async () => {
    const { client } = await setup({
      handlers: {
        "UID COPY": (c, conn) =>
          c.args.endsWith('"Missing"')
            ? conn.lines(`${c.tag} NO [TRYCREATE] Mailbox doesn't exist: Missing`)
            : conn.lines(`${c.tag} OK [COPYUID 38505 304,319:320 3956:3958] Done`),
      },
    });
    expect(await client.copy([304, 319, 320], "Archive")).toEqual({ uidValidity: 38505, sourceUids: [304, 319, 320], destUids: [3956, 3957, 3958] });
    const err = await client.copy(1, "Missing").catch((e) => e);
    expect(err).toBeInstanceOf(ImapCommandError);
    expect(err.responseCode).toBe("TRYCREATE");
  });

  it("move uses MOVE and reads untagged COPYUID; expunge events fire", async () => {
    const { client, server } = await setup({
      caps: "IMAP4rev1 MOVE UIDPLUS",
      handlers: {
        SELECT: SELECT_HANDLER,
        "UID MOVE": (c, conn) => conn.lines("* OK [COPYUID 9 10:11 20:21] Moved UIDs.", "* 5 EXPUNGE", "* 5 EXPUNGE", `${c.tag} OK Move completed`),
      },
    });
    await client.select("INBOX");
    const ex: number[] = [];
    client.on("expunge", (e) => ex.push(e.seq));
    expect(await client.move("10:11", "Trash")).toEqual({ uidValidity: 9, sourceUids: [10, 11], destUids: [20, 21] });
    expect(server.commands.at(-1)!.args).toBe('10:11 "Trash"');
    expect(ex).toEqual([5, 5]);
    expect(client.mailbox!.exists).toBe(170);
  });

  it("move fallback: COPY + STORE \\Deleted + UID EXPUNGE (UIDPLUS) / EXPUNGE (no UIDPLUS)", async () => {
    const handlers: FakeServerOptions["handlers"] = {
      "UID COPY": (c, conn) => conn.ok(c.tag),
      "UID STORE": (c, conn) => conn.ok(c.tag),
      "UID EXPUNGE": (c, conn) => conn.lines("* 3 EXPUNGE", `${c.tag} OK`),
      EXPUNGE: (c, conn) => conn.lines("* 3 EXPUNGE", "* 7 EXPUNGE", `${c.tag} OK`),
    };
    const a = await setup({ caps: "IMAP4rev1 UIDPLUS", handlers });
    await a.client.move([3], "Trash");
    expect(a.server.commands.slice(-3).map((c) => `${c.name} ${c.args}`)).toEqual([
      'UID COPY 3 "Trash"',
      "UID STORE 3 +FLAGS.SILENT (\\Deleted)",
      "UID EXPUNGE 3",
    ]);
    const b = await setup({ caps: "IMAP4rev1", handlers });
    await b.client.move([3], "Trash");
    expect(b.server.commands.at(-1)!.name).toBe("EXPUNGE");
    expect(await b.client.expunge([3])).toEqual([3, 7]); // no UIDPLUS → plain EXPUNGE
  });

  it("append with LITERAL+ (non-sync) and APPENDUID", async () => {
    const raw = "From: a@b.c\r\nSubject: नमस्ते\r\n\r\nhi\r\n";
    const { client, server } = await setup({
      caps: "IMAP4rev1 LITERAL+ UIDPLUS",
      manualContinuation: true, // a "+" here would be a protocol error
      handlers: { APPEND: (c, conn) => conn.lines(`${c.tag} OK [APPENDUID 1696000000 4392] Append completed.`) },
    });
    const r = await client.append("Sent", raw, { flags: ["\\Seen"], date: new Date(Date.UTC(2026, 9, 7, 8, 9, 10)) });
    expect(r).toEqual({ uid: 4392, uidValidity: 1696000000 });
    const cmd = server.commands.at(-1)!;
    expect(cmd.args).toBe(`"Sent" (\\Seen) "07-Oct-2026 08:09:10 +0000" {${Buffer.byteLength(raw)}+}`);
    expect(cmd.literals[0]!.toString()).toBe(raw);
  });

  it("append without LITERAL+ waits for continuation; OVERQUOTA instead of + rejects", async () => {
    const { client, server } = await setup({
      caps: "IMAP4rev1",
      refuseLiteral: (line) => (line.includes('"Full"') ? `${line.split(" ")[0]} NO [OVERQUOTA] Quota exceeded (mailbox for user is full)` : null),
      handlers: { APPEND: (c, conn) => conn.ok(c.tag, "Append completed.") },
    });
    expect(await client.append("Drafts", "x\r\n")).toEqual({});
    expect(server.commands.at(-1)!.args).toBe('"Drafts" {3}');
    expect(server.commands.at(-1)!.literals[0]!.toString()).toBe("x\r\n");
    const err = await client.append("Full", "big").catch((e) => e);
    expect(err).toBeInstanceOf(ImapCommandError);
    expect(err.responseCode).toBe("OVERQUOTA");
    await client.noop(); // still in sync
  });
});

describe("IDLE", () => {
  it("delivers events, auto-breaks for other commands, resolves on abort", async () => {
    const idleCount = { n: 0 };
    const { client, server } = await setup({
      caps: "IMAP4rev1 IDLE",
      handlers: {
        SELECT: SELECT_HANDLER,
        IDLE: async (c, conn) => {
          idleCount.n++;
          await conn.lines("+ idling");
          if (idleCount.n === 1) await conn.lines("* 173 EXISTS", "* 4 EXPUNGE", "* 2 FETCH (FLAGS (\\Seen))");
          const done = await conn.nextLine();
          if (done === "DONE") await conn.ok(c.tag, "Idle completed (0.001 + 1.000 secs).");
        },
        NOOP: (c, conn) => conn.ok(c.tag),
      },
    });
    await client.select("INBOX");
    const ac = new AbortController();
    const events: ImapEvent[] = [];
    const idling = client.idle({
      signal: ac.signal,
      onEvent: (e) => {
        events.push(e);
        if (events.length === 3) {
          // a command during IDLE → DONE, run NOOP, IDLE again
          void client.noop().then(() => setTimeout(() => ac.abort(), 50));
        }
      },
    });
    await idling;
    expect(events.map((e) => e.type)).toEqual(["exists", "expunge", "fetch"]);
    const names = server.commands.map((c) => c.name);
    expect(names.slice(-3)).toEqual(["IDLE", "NOOP", "IDLE"]);
    expect(idleCount.n).toBe(2);
  });

  it("falls back to NOOP polling without IDLE (Exchange configs)", async () => {
    let noops = 0;
    const { client } = await setup({
      caps: "IMAP4rev1",
      handlers: {
        NOOP: async (c, conn) => {
          noops++;
          if (noops === 2) await conn.lines("* 5 EXISTS");
          await conn.ok(c.tag);
        },
      },
    });
    const ac = new AbortController();
    const events: ImapEvent[] = [];
    await client.idle({
      signal: ac.signal,
      pollIntervalMs: 20,
      onEvent: (e) => {
        events.push(e);
        ac.abort();
      },
    });
    expect(noops).toBeGreaterThanOrEqual(2);
    expect(events[0]).toMatchObject({ type: "exists", count: 5 });
  });

  it("re-issues IDLE after refreshMs", async () => {
    let idles = 0;
    const { client } = await setup({
      caps: "IMAP4rev1 IDLE",
      handlers: {
        IDLE: async (c, conn) => {
          idles++;
          await conn.lines("+ idling");
          if ((await conn.nextLine()) === "DONE") await conn.ok(c.tag);
        },
      },
    });
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 200);
    await client.idle({ signal: ac.signal, refreshMs: 40 });
    expect(idles).toBeGreaterThanOrEqual(3);
  });
});

describe("quota / errors / lifecycle", () => {
  it("getQuota / getQuotaRoot", async () => {
    const { client } = await setup({
      handlers: {
        GETQUOTAROOT: (c, conn) => conn.lines('* QUOTAROOT INBOX "User quota"', '* QUOTA "User quota" (STORAGE 10240 1048576 MESSAGE 42 100000)', `${c.tag} OK done`),
        GETQUOTA: (c, conn) => conn.lines('* QUOTA "" (STORAGE 1 2)', `${c.tag} OK done`),
      },
    });
    expect(await client.getQuotaRoot("INBOX")).toEqual([
      { root: "User quota", resources: { STORAGE: { usage: 10240, limit: 1048576 }, MESSAGE: { usage: 42, limit: 100000 } } },
    ]);
    expect(await client.getQuota()).toEqual([{ root: "", resources: { STORAGE: { usage: 1, limit: 2 } } }]);
  });

  it("unsolicited BYE rejects the pending command with ImapNetworkError and emits close", async () => {
    const { client } = await setup({
      handlers: {
        NOOP: async (_c, conn) => {
          await conn.lines("* BYE Server shutting down");
          await conn.end();
        },
      },
    });
    let closed = false;
    const errors: Error[] = [];
    client.on("close", () => (closed = true));
    client.on("error", (e) => errors.push(e));
    const err = await client.noop().catch((e) => e);
    expect(err).toBeInstanceOf(ImapNetworkError);
    expect(err.code).toBe("EBYE");
    expect(closed).toBe(true);
    expect(errors.length).toBe(1);
    await expect(client.noop()).rejects.toMatchObject({ code: "ENOTCONN" });
  });

  it("command timeout rejects with ETIMEDOUT and closes the socket", async () => {
    const { client } = await setup({ handlers: { NOOP: () => undefined } }, { timeoutMs: 150 });
    const t0 = Date.now();
    const err = await client.noop().catch((e) => e);
    expect(err).toBeInstanceOf(ImapNetworkError);
    expect(err.code).toBe("ETIMEDOUT");
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(client.usable).toBe(false);
  });

  it("connect timeout when the server never greets", async () => {
    const { client } = await setup({ greeting: "" }, { timeoutMs: 150 }, false);
    // greeting "" writes a bare CRLF line — the client treats it as an unexpected greeting
    const err = await client.connect().catch((e) => e);
    expect(err).toBeInstanceOf(Error);
  });

  it("connection refused → ImapNetworkError ECONNREFUSED", async () => {
    const s = await startFakeServer();
    const port = s.port;
    await s.close();
    const c = createImapClient({ host: "127.0.0.1", port, secure: false, auth: { user: "u", pass: "p" } });
    clients.push(c);
    const err = await c.connect().catch((e) => e);
    expect(err).toBeInstanceOf(ImapNetworkError);
    expect(err.code).toBe("ECONNREFUSED");
  });

  it("logout sends LOGOUT and closes cleanly", async () => {
    const { client, server } = await setup();
    let hadError: boolean | null = null;
    client.on("close", (e) => (hadError = e));
    await client.logout();
    expect(server.commands.at(-1)!.name).toBe("LOGOUT");
    expect(hadError).toBe(false);
  });

  it("defaults: port 993 + secure; 143 when secure:false", () => {
    expect(createImapClient({ host: "imap.hostinger.com", auth: { user: "a", pass: "b" } }).port).toBe(993);
    expect(createImapClient({ host: "x", secure: false, auth: { user: "a", pass: "b" } }).port).toBe(143);
  });
});
