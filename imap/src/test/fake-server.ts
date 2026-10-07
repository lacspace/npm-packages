/**
 * Scripted fake IMAP server for tests. Listens on 127.0.0.1:<random>, parses client
 * commands (incl. sync/non-sync literals) and replays canned responses — every write is
 * fragmented at random byte boundaries to exercise the client's streaming parser.
 */
import net from "node:net";
import tls from "node:tls";
import { TEST_CERT, TEST_KEY } from "./cert.js";

export interface FakeCommand {
  tag: string;
  /** Uppercase command name, "UID FETCH" style for UID commands. */
  name: string;
  /** Everything after the name, literals shown as {n}. */
  args: string;
  line: string;
  literals: Buffer[];
}

export type Handler = (cmd: FakeCommand, conn: FakeConn) => void | Promise<void>;

export interface FakeServerOptions {
  greeting?: string;
  caps?: string;
  handlers?: Record<string, Handler>;
  /** Fragment writes (default true). */
  fragment?: boolean;
  seed?: number;
  /** Implicit TLS listener. */
  tls?: boolean;
  /** Don't answer "+" to sync literals automatically (handler sends it). */
  manualContinuation?: boolean;
  /** Return a tagged response to refuse a sync literal instead of sending "+". */
  refuseLiteral?: (line: string) => string | null;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export class FakeConn {
  socket: net.Socket;
  private chain: Promise<void> = Promise.resolve();
  private items: { line: string; literals: Buffer[] }[] = [];
  private waiters: ((v: { line: string; literals: Buffer[] } | null) => void)[] = [];
  private ended = false;
  private input: Buffer = Buffer.alloc(0);
  private cur: { parts: string[]; literals: Buffer[] } | null = null;
  private literalLeft = -1;
  state: Record<string, unknown> = {};
  private rand: () => number;

  constructor(
    socket: net.Socket,
    private opts: FakeServerOptions,
    seed: number,
  ) {
    this.socket = socket;
    this.rand = rng(seed);
    this.wire(socket);
  }

  private wire(s: net.Socket) {
    s.on("data", (d: Buffer) => this.onData(d));
    s.on("close", () => this.finish());
    s.on("error", () => this.finish());
  }

  private finish() {
    this.ended = true;
    for (const w of this.waiters.splice(0)) w(null);
  }

  private onData(d: Buffer) {
    this.input = Buffer.concat([this.input, d]);
    for (;;) {
      if (this.literalLeft >= 0) {
        if (this.input.length < this.literalLeft) return;
        this.cur!.literals.push(this.input.subarray(0, this.literalLeft));
        this.input = this.input.subarray(this.literalLeft);
        this.literalLeft = -1;
        continue;
      }
      const nl = this.input.indexOf(10);
      if (nl === -1) return;
      const line = this.input.subarray(0, nl + 1).toString("utf8").replace(/\r?\n$/, "");
      this.input = this.input.subarray(nl + 1);
      if (!this.cur) this.cur = { parts: [], literals: [] };
      const m = /\{(\d+)(\+?)\}$/.exec(line);
      if (m) {
        const refusal = !m[2] ? this.opts.refuseLiteral?.(line) : null;
        if (refusal) {
          this.cur = null;
          this.socket.write(refusal + "\r\n");
          continue;
        }
        this.cur.parts.push(line);
        this.literalLeft = Number(m[1]);
        if (!m[2] && !this.opts.manualContinuation) this.socket.write("+ Ready for literal data\r\n");
        continue;
      }
      this.cur.parts.push(line);
      const item = { line: this.cur.parts.join(""), literals: this.cur.literals };
      this.cur = null;
      const w = this.waiters.shift();
      if (w) w(item);
      else this.items.push(item);
    }
  }

  next(): Promise<{ line: string; literals: Buffer[] } | null> {
    const it = this.items.shift();
    if (it) return Promise.resolve(it);
    if (this.ended) return Promise.resolve(null);
    return new Promise((r) => this.waiters.push(r));
  }

  /** Next raw client line (AUTHENTICATE responses, DONE). */
  async nextLine(): Promise<string | null> {
    const it = await this.next();
    return it ? it.line : null;
  }

  /** Write, fragmented at random byte boundaries. */
  send(data: string | Buffer): Promise<void> {
    const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
    this.chain = this.chain.then(async () => {
      if (this.socket.destroyed) return;
      if (this.opts.fragment === false) {
        this.socket.write(buf);
        return;
      }
      let off = 0;
      while (off < buf.length) {
        const n = 1 + Math.floor(this.rand() * Math.min(buf.length - off, 23));
        this.socket.write(buf.subarray(off, off + n));
        off += n;
        await new Promise((r) => setImmediate(r));
      }
    });
    return this.chain;
  }

  /** Lines joined with CRLF (a trailing CRLF is added). */
  lines(...ls: (string | Buffer)[]): Promise<void> {
    const parts: Buffer[] = [];
    for (const l of ls) parts.push(typeof l === "string" ? Buffer.from(l + "\r\n", "utf8") : l);
    return this.send(Buffer.concat(parts));
  }

  ok(tag: string, text = "Completed"): Promise<void> {
    return this.lines(`${tag} OK ${text}`);
  }

  async upgradeTls(): Promise<void> {
    await this.chain;
    const plain = this.socket;
    plain.removeAllListeners("data");
    const sec = new tls.TLSSocket(plain, { isServer: true, key: TEST_KEY, cert: TEST_CERT });
    this.socket = sec;
    this.wire(sec);
  }

  async end(): Promise<void> {
    await this.chain;
    this.socket.end();
  }

  destroy(): void {
    this.socket.destroy();
  }
}

export interface FakeServer {
  port: number;
  commands: FakeCommand[];
  conns: FakeConn[];
  close(): Promise<void>;
}

export function parseCommand(line: string, literals: Buffer[]): FakeCommand {
  const sp = line.indexOf(" ");
  const tag = sp === -1 ? line : line.slice(0, sp);
  let rest = sp === -1 ? "" : line.slice(sp + 1);
  let m = /^(\S+)\s?(.*)$/s.exec(rest);
  let name = (m?.[1] ?? "").toUpperCase();
  rest = m?.[2] ?? "";
  if (name === "UID") {
    m = /^(\S+)\s?(.*)$/s.exec(rest);
    name = `UID ${(m?.[1] ?? "").toUpperCase()}`;
    rest = m?.[2] ?? "";
  }
  return { tag, name, args: rest, line, literals };
}

export const DOVECOT_CAPS =
  "IMAP4rev1 SASL-IR LOGIN-REFERRALS ID ENABLE IDLE SORT SORT=DISPLAY THREAD=REFERENCES THREAD=REFS THREAD=ORDEREDSUBJECT MULTIAPPEND URL-PARTIAL CATENATE UNSELECT CHILDREN NAMESPACE UIDPLUS LIST-EXTENDED I18NLEVEL=1 CONDSTORE QRESYNC ESEARCH ESORT SEARCHRES WITHIN CONTEXT=SEARCH LIST-STATUS BINARY MOVE SNIPPET=FUZZY PREVIEW=FUZZY PREVIEW STATUS=SIZE SAVEDATE LITERAL+ NOTIFY SPECIAL-USE QUOTA";

export async function startFakeServer(opts: FakeServerOptions = {}): Promise<FakeServer> {
  const commands: FakeCommand[] = [];
  const conns: FakeConn[] = [];
  let seed = opts.seed ?? 12345;
  const caps = opts.caps ?? "IMAP4rev1 LITERAL+ SASL-IR AUTH=PLAIN IDLE UIDPLUS MOVE";
  const handlers: Record<string, Handler> = {
    CAPABILITY: async (c, conn) => {
      await conn.lines(`* CAPABILITY ${caps}`);
      await conn.ok(c.tag);
    },
    LOGIN: (c, conn) => conn.ok(c.tag, "Logged in"),
    NOOP: (c, conn) => conn.ok(c.tag),
    LOGOUT: async (c, conn) => {
      await conn.lines("* BYE Logging out", `${c.tag} OK Logout completed.`);
      await conn.end();
    },
    ...opts.handlers,
  };
  const onConn = async (socket: net.Socket) => {
    const conn = new FakeConn(socket, opts, seed++);
    conns.push(conn);
    await conn.lines(opts.greeting ?? `* OK [CAPABILITY ${caps}] Dovecot ready.`);
    for (;;) {
      const it = await conn.next();
      if (!it) break;
      const cmd = parseCommand(it.line, it.literals);
      commands.push(cmd);
      const h = handlers[cmd.name];
      try {
        if (h) await h(cmd, conn);
        else await conn.lines(`${cmd.tag} BAD Unknown command ${cmd.name}`);
      } catch {
        conn.destroy();
        break;
      }
    }
  };
  const server = opts.tls
    ? tls.createServer({ key: TEST_KEY, cert: TEST_CERT }, (s) => void onConn(s))
    : net.createServer((s) => void onConn(s));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as net.AddressInfo).port;
  return {
    port,
    commands,
    conns,
    close: () =>
      new Promise<void>((r) => {
        for (const c of conns) c.destroy();
        server.close(() => r());
      }),
  };
}
