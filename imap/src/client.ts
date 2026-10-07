import { EventEmitter } from "node:events";
import net from "node:net";
import tls from "node:tls";
import { ImapAuthError, ImapCommandError, ImapError, ImapNetworkError, ImapProtocolError } from "./errors.js";
import {
  type CommandArg,
  buildSearch,
  encodeString,
  expandSequenceSet,
  flagList,
  formatInternalDate,
  isAscii,
  joinArgs,
  parseInternalDate,
  sortUidsDesc,
  toSequenceSet,
} from "./encode.js";
import { guessSpecialUse, specialUseFromFlags } from "./mailboxes.js";
import {
  type ImapResponse,
  type ImapToken,
  ResponseFramer,
  firstLine,
  parseImapResponse,
  tokBigInt,
  tokBytes,
  tokList,
  tokNumber,
  tokString,
} from "./parser.js";
import { parseBodyStructure, parseEnvelope } from "./structures.js";
import type {
  AppendResult,
  CopyResult,
  FetchQuery,
  FetchedMessage,
  IdleOptions,
  ImapClientOptions,
  ImapEvent,
  Mailbox,
  MailboxStatus,
  Quota,
  SearchCriteria,
  SelectedMailbox,
  StatusItem,
  StoreResult,
} from "./types.js";
import { decodeModifiedUtf7, encodeModifiedUtf7 } from "./utf7.js";

type Segment = string | { literal: Uint8Array };

interface ExecOptions {
  /** Return true when the response is fully handled (no event, not collected). */
  untagged?: (r: ImapResponse) => boolean;
  onContinuation?: (r: ImapResponse) => void;
  /** Collect untagged responses not consumed by `untagged`. Default true. */
  collect?: boolean;
  sensitive?: string;
  auth?: boolean;
  idle?: boolean;
}

interface Pending {
  tag: string;
  name: string;
  segments: Segment[];
  opts: ExecOptions;
  collected: ImapResponse[];
  waitingLiteral: number;
  resolve: (r: CommandResult) => void;
  reject: (e: Error) => void;
  timedOutAllowed: boolean;
}

export interface CommandResult {
  tagged: ImapResponse;
  untagged: ImapResponse[];
}

const DEFAULT_TIMEOUT = 30_000;
const FETCH_HIGH_WATER = 64;

function mailboxArg(path: string): CommandArg {
  if (path.toUpperCase() === "INBOX") return "INBOX";
  return encodeString(encodeModifiedUtf7(path));
}

function codeArgString(r: ImapResponse, i: number): string | null {
  return r.code ? tokString(r.code.args[i]) : null;
}

function upperFlags(list: ImapToken[] | null): string[] {
  return (list ?? []).map((t) => tokString(t)).filter((s): s is string => s !== null);
}

function validSection(s: string): string {
  // eslint-disable-next-line no-control-regex
  if (/[\r\n\]\x00]/.test(s)) throw new ImapError(`Invalid body section ${JSON.stringify(s)}`, "EINVAL");
  return s.toUpperCase();
}

export interface ImapClient {
  on(event: "exists", listener: (e: Extract<ImapEvent, { type: "exists" }>) => void): this;
  on(event: "expunge", listener: (e: Extract<ImapEvent, { type: "expunge" }>) => void): this;
  on(event: "fetch", listener: (e: Extract<ImapEvent, { type: "fetch" }>) => void): this;
  on(event: "recent", listener: (e: Extract<ImapEvent, { type: "recent" }>) => void): this;
  on(event: "flags", listener: (e: Extract<ImapEvent, { type: "flags" }>) => void): this;
  on(event: "close", listener: (hadError: boolean) => void): this;
  on(event: "error", listener: (err: ImapError) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string | symbol, listener: (...args: any[]) => void): this;
}

export class ImapClient extends EventEmitter {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  /** Uppercased capability atoms, refreshed after STARTTLS and login. */
  capabilities = new Set<string>();
  /** The currently selected mailbox (kept up to date with EXISTS/EXPUNGE). */
  mailbox: SelectedMailbox | null = null;
  authenticated = false;
  /** Free text of the server greeting. */
  greeting = "";

  private opts: ImapClientOptions;
  private socket: net.Socket | null = null;
  private framer: ResponseFramer | null = null;
  private tagCounter = 0;
  private queue: Pending[] = [];
  private current: Pending | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerPaused = false;
  private greetingWaiter: { resolve: (preauth: boolean) => void; reject: (e: Error) => void } | null = null;
  private closed = false;
  private closing = false;
  private byeText: string | null = null;
  private idleBreak: (() => void) | null = null;
  private eventSinks = new Set<(e: ImapEvent) => void>();
  private readPaused = 0;
  private boundData = (d: Buffer) => this.onData(d);
  private boundError = (e: Error & { code?: string }) => this.fail(new ImapNetworkError(e.message, e.code ?? "ESOCKET"));
  private boundClose = () => this.onSocketClose();
  private boundTimeout = () => this.fail(new ImapNetworkError("Socket idle timeout", "ESOCKETTIMEDOUT"));

  constructor(opts: ImapClientOptions) {
    super();
    if (!opts || !opts.host) throw new ImapError("host is required", "EINVAL");
    if (!opts.auth || !opts.auth.user) throw new ImapError("auth.user is required", "EINVAL");
    this.opts = opts;
    this.host = opts.host;
    this.secure = opts.secure !== false;
    this.port = opts.port ?? (this.secure ? 993 : 143);
  }

  private get timeoutMs(): number {
    return this.opts.timeoutMs ?? DEFAULT_TIMEOUT;
  }

  private log(msg: string): void {
    try {
      this.opts.logger?.debug(msg);
    } catch {
      /* logger errors never break the session */
    }
  }

  get usable(): boolean {
    return !!this.socket && !this.closed;
  }

  // ---- connection -------------------------------------------------------

  async connect(): Promise<void> {
    if (this.socket || this.closed) throw new ImapError("connect() can only be called once per client", "EINVAL");
    const preauth = await this.openSocket();
    try {
      if (!this.capabilities.size) await this.capability();
      if (!this.secure && this.opts.starttls !== false) await this.startTls();
      if (preauth) this.authenticated = true;
      else await this.login();
      if (this.opts.clientId && this.capabilities.has("ID")) {
        await this.id(this.opts.clientId).catch(() => undefined);
      }
    } catch (e) {
      this.close();
      throw e;
    }
  }

  private openSocket(): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.greetingWaiter = null;
        const err = new ImapNetworkError(`Connection to ${this.host}:${this.port} timed out after ${this.timeoutMs}ms`, "ETIMEDOUT");
        this.fail(err);
        reject(err);
      }, this.timeoutMs);
      this.greetingWaiter = {
        resolve: (p) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(p);
        },
        reject: (e) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(e);
        },
      };
      this.log(`* connecting to ${this.host}:${this.port}${this.secure ? " (TLS)" : ""}`);
      let sock: net.Socket;
      try {
        if (this.secure) {
          sock = tls.connect({
            host: this.host,
            port: this.port,
            servername: net.isIP(this.host) ? undefined : this.host,
            ...this.opts.tls,
          });
        } else {
          sock = net.connect({ host: this.host, port: this.port });
        }
      } catch (e) {
        const err = new ImapNetworkError((e as Error).message, (e as { code?: string }).code ?? "ECONNECT");
        this.greetingWaiter.reject(err);
        return;
      }
      this.attach(sock);
    });
  }

  private attach(sock: net.Socket): void {
    this.socket = sock;
    this.framer = new ResponseFramer((raw) => this.onResponse(raw));
    sock.on("data", this.boundData);
    sock.on("error", this.boundError);
    sock.on("close", this.boundClose);
    if (this.opts.socketTimeoutMs) {
      sock.setTimeout(this.opts.socketTimeoutMs);
      sock.on("timeout", this.boundTimeout);
    }
  }

  private detach(sock: net.Socket): void {
    sock.off("data", this.boundData);
    sock.off("error", this.boundError);
    sock.off("close", this.boundClose);
    sock.off("timeout", this.boundTimeout);
    sock.setTimeout(0);
  }

  private async startTls(): Promise<void> {
    const required = this.opts.starttls === "required";
    if (!this.capabilities.has("STARTTLS")) {
      if (required) throw new ImapNetworkError("Server does not advertise STARTTLS", "ESTARTTLS");
      this.log("* STARTTLS not advertised, continuing without TLS");
      return;
    }
    try {
      await this.exec(["STARTTLS"]);
    } catch (e) {
      if (e instanceof ImapCommandError) {
        if (required) throw new ImapNetworkError(`STARTTLS refused: ${e.responseText}`, "ESTARTTLS");
        this.log("* STARTTLS refused, continuing without TLS");
        return;
      }
      throw e;
    }
    const plain = this.socket!;
    this.detach(plain);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const err = new ImapNetworkError("TLS handshake timed out", "ETIMEDOUT");
        this.fail(err);
        reject(err);
      }, this.timeoutMs);
      const secure = tls.connect({
        socket: plain,
        servername: net.isIP(this.host) ? undefined : this.host,
        ...this.opts.tls,
      });
      const onErr = (e: Error & { code?: string }) => {
        clearTimeout(timer);
        const err = new ImapNetworkError(e.message, e.code ?? "ETLS");
        this.fail(err);
        reject(err);
      };
      secure.once("error", onErr);
      secure.once("secureConnect", () => {
        clearTimeout(timer);
        secure.off("error", onErr);
        this.attach(secure);
        resolve();
      });
    });
    this.log("* TLS established");
    this.capabilities.clear();
    await this.capability();
  }

  private async login(): Promise<void> {
    const auth = this.opts.auth;
    let res: CommandResult;
    if ("accessToken" in auth) {
      if (this.capabilities.has("AUTH=XOAUTH2")) {
        const payload = Buffer.from(`user=${auth.user}\x01auth=Bearer ${auth.accessToken}\x01\x01`).toString("base64");
        res = await this.sasl("XOAUTH2", payload, "");
      } else if (this.capabilities.has("AUTH=OAUTHBEARER")) {
        const port = this.port;
        const payload = Buffer.from(
          `n,a=${auth.user.replace(/=/g, "=3D").replace(/,/g, "=2C")},\x01host=${this.host}\x01port=${port}\x01auth=Bearer ${auth.accessToken}\x01\x01`,
        ).toString("base64");
        res = await this.sasl("OAUTHBEARER", payload, "AQ==");
      } else {
        throw new ImapAuthError("Server advertises neither AUTH=XOAUTH2 nor AUTH=OAUTHBEARER");
      }
    } else {
      const loginDisabled = this.capabilities.has("LOGINDISABLED");
      const plainOk = this.capabilities.has("AUTH=PLAIN");
      const needsUtf8 = !isAscii(auth.user) || !isAscii(auth.pass);
      if (loginDisabled && !plainOk) {
        throw new ImapAuthError("Server has LOGINDISABLED (use TLS / STARTTLS) and no AUTH=PLAIN");
      }
      if (loginDisabled || (needsUtf8 && plainOk)) {
        const payload = Buffer.from(`\0${auth.user}\0${auth.pass}`, "utf8").toString("base64");
        res = await this.sasl("PLAIN", payload, "");
      } else {
        res = await this.exec(["LOGIN", encodeString(auth.user), encodeString(auth.pass)], {
          sensitive: "LOGIN",
          auth: true,
        });
      }
    }
    this.authenticated = true;
    if (res.tagged.code?.name !== "CAPABILITY" && !res.untagged.some((r) => r.type === "CAPABILITY")) {
      await this.capability();
    }
  }

  private sasl(mech: string, initial: string, abort: string): Promise<CommandResult> {
    const ir = this.capabilities.has("SASL-IR");
    let sent = ir;
    const args: CommandArg[] = ["AUTHENTICATE", mech];
    if (ir) args.push(initial);
    return this.exec(args, {
      sensitive: `AUTHENTICATE ${mech}`,
      auth: true,
      onContinuation: () => {
        // first "+" (no SASL-IR) → send credentials; any later "+" is an error challenge → abort/ack
        const line = sent ? abort : initial;
        sent = true;
        this.write(Buffer.from(line + "\r\n"), "C: ****");
      },
    });
  }

  /** LOGOUT politely, then close. Never throws. */
  async logout(): Promise<void> {
    if (!this.usable) return;
    this.closing = true;
    try {
      await this.exec(["LOGOUT"]);
    } catch {
      /* server may drop the line right after BYE */
    }
    this.close();
  }

  /** Destroy the socket immediately; pending commands reject with ECONNCLOSED. */
  close(): void {
    this.closing = true;
    if (this.closed) return;
    this.fail(new ImapNetworkError("Connection closed", "ECONNCLOSED"));
  }

  private onSocketClose(): void {
    if (this.closed) return;
    const msg = this.byeText !== null ? `Server closed the connection: ${this.byeText}` : "Connection closed by server";
    this.fail(new ImapNetworkError(msg, this.byeText !== null ? "EBYE" : "ECONNRESET"));
  }

  private fail(err: ImapError): void {
    if (this.closed) return;
    this.closed = true;
    this.clearTimer();
    const deliberate = this.closing;
    const pending = [...(this.current ? [this.current] : []), ...this.queue];
    this.current = null;
    this.queue = [];
    for (const p of pending) p.reject(err);
    this.greetingWaiter?.reject(err);
    this.greetingWaiter = null;
    if (this.socket) {
      this.detach(this.socket);
      this.socket.on("error", () => undefined);
      this.socket.destroy();
    }
    this.authenticated = false;
    if (!deliberate) {
      this.log(`* connection failed: ${err.message}`);
      if (this.listenerCount("error") > 0) this.emit("error", err);
    }
    this.emit("close", !deliberate);
  }

  // ---- low-level I/O ----------------------------------------------------

  private write(buf: Uint8Array, logLine: string): void {
    this.log(logLine);
    this.socket?.write(buf);
  }

  private onData(d: Buffer): void {
    if (this.timer && !this.timerPaused) this.armTimer();
    try {
      this.framer?.push(d);
    } catch (e) {
      this.fail(e instanceof ImapError ? e : new ImapProtocolError((e as Error).message, ""));
    }
  }

  private armTimer(): void {
    this.clearTimer();
    const cur = this.current;
    if (!cur || !cur.timedOutAllowed) return;
    this.timer = setTimeout(() => {
      this.fail(new ImapNetworkError(`${cur.name} timed out after ${this.timeoutMs}ms`, "ETIMEDOUT"));
    }, this.timeoutMs);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private pauseReading(): void {
    if (this.readPaused++ === 0) {
      this.socket?.pause();
      this.timerPaused = true;
      this.clearTimer();
    }
  }

  private resumeReading(): void {
    if (this.readPaused === 0) return;
    if (--this.readPaused === 0) {
      this.timerPaused = false;
      if (this.current) this.armTimer();
      this.socket?.resume();
    }
  }

  private onResponse(raw: Buffer): void {
    let r: ImapResponse;
    try {
      r = parseImapResponse(raw);
    } catch (e) {
      this.fail(e instanceof ImapProtocolError ? e : new ImapProtocolError("Unparseable response", firstLine(raw)));
      return;
    }
    const extra = raw.indexOf(0x0a) < raw.length - 1 ? ` (+${raw.length - raw.indexOf(0x0a) - 1} literal bytes)` : "";
    this.log("S: " + firstLine(raw, 300) + extra);

    if (r.code?.name === "CAPABILITY") this.setCaps(r.code.args);

    if (this.greetingWaiter) {
      const w = this.greetingWaiter;
      if (r.tag === "*" && (r.type === "OK" || r.type === "PREAUTH")) {
        this.greetingWaiter = null;
        this.greeting = r.text ?? "";
        w.resolve(r.type === "PREAUTH");
      } else if (r.tag === "*" && r.type === "BYE") {
        this.greetingWaiter = null;
        this.byeText = r.text ?? "";
        const err = new ImapNetworkError(`Server refused connection: ${r.text ?? ""}`, "EBYE");
        w.reject(err);
        this.fail(err);
      } else {
        this.greetingWaiter = null;
        const err = new ImapProtocolError("Unexpected greeting", firstLine(raw));
        w.reject(err);
        this.fail(err);
      }
      return;
    }

    if (r.tag === "+") return this.onContinuation(r);
    if (r.tag === "*") return this.onUntagged(r);
    const cur = this.current;
    if (!cur || r.tag !== cur.tag) {
      this.log(`* ignoring response for unknown tag ${r.tag}`);
      return;
    }
    this.clearTimer();
    this.current = null;
    if (r.type === "OK") {
      cur.resolve({ tagged: r, untagged: cur.collected });
    } else {
      const status = r.type === "BAD" ? "BAD" : "NO";
      const code = r.code?.name;
      if (cur.opts.auth) cur.reject(new ImapAuthError(`Authentication failed: ${r.text ?? status}`, code, r.text));
      else if (r.type === "NO" || r.type === "BAD") cur.reject(new ImapCommandError(cur.name, status, r.text ?? "", code));
      else cur.reject(new ImapProtocolError(`Unexpected tagged ${r.type}`, firstLine(raw)));
    }
    this.pump();
  }

  private setCaps(args: ImapToken[]): void {
    const caps = new Set<string>();
    for (const a of args) {
      const s = tokString(a);
      if (s) caps.add(s.toUpperCase());
    }
    if (caps.size) this.capabilities = caps;
  }

  private onContinuation(r: ImapResponse): void {
    const cur = this.current;
    if (!cur) {
      this.log("* unexpected continuation");
      return;
    }
    if (cur.waitingLiteral >= 0) {
      const i = cur.waitingLiteral;
      cur.waitingLiteral = -1;
      const seg = cur.segments[i] as { literal: Uint8Array };
      this.write(seg.literal, cur.opts.sensitive ? "C: ****" : `C: <${seg.literal.length} bytes>`);
      this.sendFrom(cur, i + 1);
      return;
    }
    if (cur.opts.onContinuation) {
      cur.opts.onContinuation(r);
      return;
    }
    this.log("* continuation with nothing to send");
  }

  private onUntagged(r: ImapResponse): void {
    if (r.type === "CAPABILITY") this.setCaps(r.attributes);
    if (r.type === "BYE") this.byeText = r.text ?? "";
    const cur = this.current;
    const consumed = cur?.opts.untagged?.(r) ?? false;
    if (!consumed && cur && cur.opts.collect !== false) cur.collected.push(r);
    const path = this.mailbox?.path ?? null;
    switch (r.type) {
      case "EXISTS": {
        const prev = this.mailbox?.exists ?? 0;
        const count = r.number ?? 0;
        if (this.mailbox) this.mailbox.exists = count;
        if (!consumed) this.emitEvent({ type: "exists", path, count, prevCount: prev });
        break;
      }
      case "EXPUNGE": {
        if (this.mailbox && this.mailbox.exists > 0) this.mailbox.exists--;
        if (!consumed) this.emitEvent({ type: "expunge", path, seq: r.number ?? 0 });
        break;
      }
      case "RECENT":
        if (this.mailbox) this.mailbox.recent = r.number ?? 0;
        if (!consumed) this.emitEvent({ type: "recent", path, count: r.number ?? 0 });
        break;
      case "FLAGS":
        if (!consumed) {
          const flags = upperFlags(tokList(r.attributes[0]));
          if (this.mailbox) this.mailbox.flags = flags;
          this.emitEvent({ type: "flags", path, flags });
        }
        break;
      case "FETCH":
        if (!consumed) {
          const m = this.parseFetch(r);
          const e: ImapEvent = { type: "fetch", path, seq: m.seq };
          if (m.uid) e.uid = m.uid;
          if (m.flags) e.flags = m.flags;
          if (m.modseq !== undefined) e.modseq = m.modseq;
          this.emitEvent(e);
        }
        break;
      default:
        break;
    }
  }

  private emitEvent(e: ImapEvent): void {
    for (const s of this.eventSinks) {
      try {
        s(e);
      } catch {
        /* user callback errors are theirs */
      }
    }
    this.emit(e.type, e);
  }

  // ---- command engine ---------------------------------------------------

  /** Run a raw command. `args` are joined with spaces; Uint8Array items are sent as literals. */
  exec(args: CommandArg[], opts: ExecOptions = {}): Promise<CommandResult> {
    if (!this.usable) return Promise.reject(new ImapNetworkError("Not connected", "ENOTCONN"));
    const segments: Segment[] = joinArgs(args).map((a) => (typeof a === "string" ? a : { literal: a }));
    const first = typeof args[0] === "string" ? args[0] : "COMMAND";
    const name = (typeof args[1] === "string" && /^(UID)$/i.test(first) ? `${first} ${args[1]}` : first).toUpperCase();
    return new Promise<CommandResult>((resolve, reject) => {
      this.queue.push({
        tag: "",
        name,
        segments,
        opts,
        collected: [],
        waitingLiteral: -1,
        resolve,
        reject,
        timedOutAllowed: !opts.idle,
      });
      if (this.current?.opts.idle) this.idleBreak?.();
      this.pump();
    });
  }

  private pump(): void {
    if (this.current || !this.queue.length || !this.usable) return;
    const cmd = this.queue.shift()!;
    cmd.tag = "A" + ++this.tagCounter;
    this.current = cmd;
    this.sendFrom(cmd, 0);
    this.armTimer();
  }

  private sendFrom(cmd: Pending, start: number): void {
    const out: Uint8Array[] = [];
    let log = "";
    if (start === 0) {
      out.push(Buffer.from(cmd.tag + " "));
      log = cmd.tag + " ";
      if (cmd.opts.sensitive) log += cmd.opts.sensitive + " ****";
    }
    const caps = this.capabilities;
    for (let i = start; i < cmd.segments.length; i++) {
      const s = cmd.segments[i]!;
      if (typeof s === "string") {
        out.push(Buffer.from(s, "utf8"));
        if (!cmd.opts.sensitive) log += s;
        continue;
      }
      const n = s.literal.length;
      const nonSync = caps.has("LITERAL+") || (caps.has("LITERAL-") && n <= 4096);
      if (nonSync) {
        out.push(Buffer.from(`{${n}+}\r\n`), s.literal);
        if (!cmd.opts.sensitive) log += `{${n}+}<${n} bytes>`;
        continue;
      }
      out.push(Buffer.from(`{${n}}\r\n`));
      if (!cmd.opts.sensitive) log += `{${n}}`;
      cmd.waitingLiteral = i;
      this.write(Buffer.concat(out), "C: " + log);
      return;
    }
    out.push(Buffer.from("\r\n"));
    this.write(Buffer.concat(out), "C: " + (log || "****"));
  }

  // ---- basic commands ---------------------------------------------------

  async capability(): Promise<Set<string>> {
    await this.exec(["CAPABILITY"]);
    return new Set(this.capabilities);
  }

  async noop(): Promise<void> {
    await this.exec(["NOOP"]);
  }

  /** RFC 2971 ID. Returns the server's ID map (or null). */
  async id(info?: Record<string, string>): Promise<Record<string, string> | null> {
    const args: CommandArg[] = ["ID"];
    const entries = Object.entries(info ?? {});
    if (!entries.length) args.push("NIL");
    else {
      args.push("(");
      for (const [k, v] of entries) args.push(encodeString(k), encodeString(v));
      args.push(")");
    }
    const res = await this.exec(args);
    const r = res.untagged.find((x) => x.type === "ID");
    const list = r ? tokList(r.attributes[0]) : null;
    if (!list) return null;
    const out: Record<string, string> = {};
    for (let i = 0; i + 1 < list.length; i += 2) {
      const k = tokString(list[i]);
      if (k !== null) out[k] = tokString(list[i + 1]) ?? "";
    }
    return out;
  }

  // ---- mailboxes --------------------------------------------------------

  private parseListResponse(r: ImapResponse): Mailbox | null {
    const flags = upperFlags(tokList(r.attributes[0]));
    const delimiter = tokString(r.attributes[1]);
    const rawPath = tokString(r.attributes[2]);
    if (rawPath === null) return null;
    let path = decodeModifiedUtf7(rawPath);
    if (path.toUpperCase() === "INBOX") path = "INBOX";
    const name = delimiter ? path.split(delimiter).pop() ?? path : path;
    const box: Mailbox = { path, rawPath, name, delimiter: delimiter || null, flags };
    const su = specialUseFromFlags(flags);
    if (su) box.specialUse = su;
    if (path === "INBOX") box.specialUse = "\\Inbox";
    if (flags.some((f) => f.toLowerCase() === "\\subscribed")) box.subscribed = true;
    // LIST-EXTENDED CHILDINFO etc. ignored
    return box;
  }

  /** All mailboxes with decoded paths and best-effort special-use roles. */
  async listMailboxes(): Promise<Mailbox[]> {
    const caps = this.capabilities;
    const ext = caps.has("LIST-EXTENDED");
    const special = caps.has("SPECIAL-USE");
    let boxes: Mailbox[] = [];
    let haveSubscribed = false;
    if (ext) {
      const ret = special ? "RETURN (SPECIAL-USE SUBSCRIBED)" : "RETURN (SUBSCRIBED)";
      const res = await this.exec(["LIST", '""', '"*"', ret]);
      boxes = res.untagged.filter((r) => r.type === "LIST").map((r) => this.parseListResponse(r)).filter((b): b is Mailbox => !!b);
      for (const b of boxes) if (!b.subscribed) b.subscribed = false;
      haveSubscribed = true;
    } else {
      const res = await this.exec(["LIST", '""', '"*"']);
      boxes = res.untagged.filter((r) => r.type === "LIST").map((r) => this.parseListResponse(r)).filter((b): b is Mailbox => !!b);
      if (!special && caps.has("XLIST")) {
        try {
          const x = await this.exec(["XLIST", '""', '"*"']);
          const byPath = new Map(boxes.map((b) => [b.path, b]));
          for (const r of x.untagged.filter((u) => u.type === "XLIST")) {
            const xb = this.parseListResponse(r);
            if (!xb) continue;
            const b = byPath.get(xb.path);
            if (b && xb.specialUse) b.specialUse = xb.specialUse;
          }
        } catch (e) {
          if (!(e instanceof ImapCommandError)) throw e;
        }
      }
    }
    // dedupe (some servers repeat INBOX)
    const seen = new Set<string>();
    boxes = boxes.filter((b) => (seen.has(b.path) ? false : (seen.add(b.path), true)));
    if (!haveSubscribed) {
      try {
        const res = await this.exec(["LSUB", '""', '"*"']);
        const subs = new Set(
          res.untagged
            .filter((r) => r.type === "LSUB")
            .map((r) => tokString(r.attributes[2]))
            .filter((s): s is string => s !== null)
            .map((s) => {
              const p = decodeModifiedUtf7(s);
              return p.toUpperCase() === "INBOX" ? "INBOX" : p;
            }),
        );
        for (const b of boxes) b.subscribed = subs.has(b.path);
      } catch (e) {
        if (!(e instanceof ImapCommandError)) throw e;
      }
    }
    guessSpecialUse(boxes);
    return boxes;
  }

  async select(path: string, opts: { readOnly?: boolean; condstore?: boolean } = {}): Promise<SelectedMailbox> {
    const info: SelectedMailbox = {
      path: path.toUpperCase() === "INBOX" ? "INBOX" : path,
      exists: 0,
      recent: 0,
      uidValidity: 0,
      uidNext: 0,
      flags: [],
      permanentFlags: [],
      readOnly: !!opts.readOnly,
    };
    const args: CommandArg[] = [opts.readOnly ? "EXAMINE" : "SELECT", mailboxArg(path)];
    if (opts.condstore && this.capabilities.has("CONDSTORE")) args.push("(CONDSTORE)");
    this.mailbox = null;
    let res: CommandResult;
    try {
      res = await this.exec(args, {
        untagged: (r) => {
          switch (r.type) {
            case "EXISTS":
              info.exists = r.number ?? 0;
              return true;
            case "RECENT":
              info.recent = r.number ?? 0;
              return true;
            case "FLAGS":
              info.flags = upperFlags(tokList(r.attributes[0]));
              return true;
            case "OK": {
              const c = r.code;
              if (!c) return false;
              if (c.name === "UNSEEN") info.unseen = tokNumber(c.args[0]);
              else if (c.name === "UIDVALIDITY") info.uidValidity = tokNumber(c.args[0]) ?? 0;
              else if (c.name === "UIDNEXT") info.uidNext = tokNumber(c.args[0]) ?? 0;
              else if (c.name === "PERMANENTFLAGS") info.permanentFlags = upperFlags(tokList(c.args[0]));
              else if (c.name === "HIGHESTMODSEQ") {
                const v = tokBigInt(c.args[0]);
                if (v !== undefined) info.highestModseq = v;
              } else return false;
              return true;
            }
            default:
              return false;
          }
        },
      });
    } catch (e) {
      this.mailbox = null;
      throw e;
    }
    const code = res.tagged.code?.name;
    if (code === "READ-ONLY") info.readOnly = true;
    else if (code === "READ-WRITE") info.readOnly = false;
    this.mailbox = info;
    return { ...info };
  }

  async status(path: string, items?: StatusItem[]): Promise<MailboxStatus> {
    const want: StatusItem[] = items?.length ? items : ["MESSAGES", "UNSEEN", "UIDNEXT", "UIDVALIDITY", "RECENT"];
    if (!items?.length && this.capabilities.has("CONDSTORE")) want.push("HIGHESTMODSEQ");
    const res = await this.exec(["STATUS", mailboxArg(path), "(" + want.join(" ") + ")"]);
    const out: MailboxStatus = { messages: 0, unseen: 0, uidNext: 0, uidValidity: 0, recent: 0 };
    for (const r of res.untagged) {
      if (r.type !== "STATUS") continue;
      const list = tokList(r.attributes[1]) ?? [];
      for (let i = 0; i + 1 < list.length; i += 2) {
        const k = (tokString(list[i]) ?? "").toUpperCase();
        const v = list[i + 1];
        if (k === "MESSAGES") out.messages = tokNumber(v) ?? 0;
        else if (k === "UNSEEN") out.unseen = tokNumber(v) ?? 0;
        else if (k === "UIDNEXT") out.uidNext = tokNumber(v) ?? 0;
        else if (k === "UIDVALIDITY") out.uidValidity = tokNumber(v) ?? 0;
        else if (k === "RECENT") out.recent = tokNumber(v) ?? 0;
        else if (k === "HIGHESTMODSEQ") {
          const b = tokBigInt(v);
          if (b !== undefined) out.highestModseq = b;
        }
      }
    }
    return out;
  }

  async createMailbox(path: string): Promise<{ created: boolean }> {
    try {
      await this.exec(["CREATE", mailboxArg(path)]);
      return { created: true };
    } catch (e) {
      if (e instanceof ImapCommandError && e.responseCode === "ALREADYEXISTS") return { created: false };
      throw e;
    }
  }

  async renameMailbox(from: string, to: string): Promise<void> {
    await this.exec(["RENAME", mailboxArg(from), mailboxArg(to)]);
    if (this.mailbox?.path === from) this.mailbox.path = to;
  }

  async deleteMailbox(path: string): Promise<void> {
    if (this.mailbox?.path === path) {
      // RFC 3501 lets servers refuse deleting the selected mailbox
      try {
        if (this.capabilities.has("UNSELECT")) await this.exec(["UNSELECT"]);
      } catch {
        /* ignore */
      }
      this.mailbox = null;
    }
    await this.exec(["DELETE", mailboxArg(path)]);
  }

  async subscribe(path: string): Promise<void> {
    await this.exec(["SUBSCRIBE", mailboxArg(path)]);
  }

  async unsubscribe(path: string): Promise<void> {
    await this.exec(["UNSUBSCRIBE", mailboxArg(path)]);
  }

  // ---- search / fetch ---------------------------------------------------

  async search(criteria: SearchCriteria = {}, opts: { uid?: boolean } = {}): Promise<number[]> {
    const uid = opts.uid !== false;
    const built = buildSearch(criteria);
    const args: CommandArg[] = uid ? ["UID", "SEARCH"] : ["SEARCH"];
    if (built.charset && !this.capabilities.has("UTF8=ONLY")) args.push("CHARSET", built.charset);
    args.push(...built.args);
    const res = await this.exec(args);
    const out: number[] = [];
    for (const r of res.untagged) {
      if (r.type !== "SEARCH") continue;
      for (const a of r.attributes) {
        if (a && a.type === "atom" && /^\d+$/.test(a.value)) out.push(Number(a.value));
      }
    }
    return out;
  }

  /** Newest-first copy of a UID list. */
  sortUidsDesc(uids: Iterable<number>): number[] {
    return sortUidsDesc(uids);
  }

  private buildFetchItems(q: FetchQuery): { items: string[]; extra: Set<string> } {
    const items = ["UID"];
    const extra = new Set<string>(); // non-flag items we asked for
    const add = (s: string, isExtra = true) => {
      items.push(s);
      if (isExtra) extra.add(s);
    };
    if (q.flags) add("FLAGS", false);
    if (q.envelope) add("ENVELOPE");
    if (q.internalDate) add("INTERNALDATE");
    if (q.size) add("RFC822.SIZE");
    if (q.bodyStructure) add("BODYSTRUCTURE");
    if ((q.modseq || q.changedSince !== undefined) && this.capabilities.has("CONDSTORE")) add("MODSEQ", false);
    if (q.gmLabels && this.capabilities.has("X-GM-EXT-1")) add("X-GM-LABELS");
    const B = q.peek === false ? "BODY" : "BODY.PEEK";
    if (q.headers === true) add(`${B}[HEADER]`);
    else if (Array.isArray(q.headers) && q.headers.length) {
      const names = q.headers.map((h) => h.replace(/[^A-Za-z0-9_-]/g, "")).filter(Boolean);
      add(`${B}[HEADER.FIELDS (${names.map((n) => n.toUpperCase()).join(" ")})]`);
    }
    for (const p of q.bodyParts ?? []) {
      const partial = q.maxPartBytes && q.maxPartBytes > 0 ? `<0.${Math.floor(q.maxPartBytes)}>` : "";
      add(`${B}[${validSection(p)}]${partial}`);
    }
    if (q.source) add(`${B}[]`);
    return { items, extra };
  }

  private parseFetch(r: ImapResponse, query?: FetchQuery): FetchedMessage {
    const msg: FetchedMessage = { seq: r.number ?? 0, uid: 0, parts: {} };
    const list = tokList(r.attributes[0]) ?? [];
    for (let i = 0; i + 1 < list.length; i += 2) {
      const key = (tokString(list[i]) ?? "").toUpperCase();
      const v = list[i + 1];
      switch (key) {
        case "UID":
          msg.uid = tokNumber(v) ?? 0;
          break;
        case "FLAGS":
          msg.flags = upperFlags(tokList(v));
          break;
        case "ENVELOPE":
          msg.envelope = parseEnvelope(v);
          break;
        case "INTERNALDATE": {
          const d = parseInternalDate(tokString(v) ?? "");
          if (d) msg.internalDate = d;
          break;
        }
        case "RFC822.SIZE":
          msg.size = tokNumber(v);
          break;
        case "BODYSTRUCTURE":
        case "BODY": {
          const bs = parseBodyStructure(v);
          if (bs) msg.bodyStructure = bs;
          break;
        }
        case "MODSEQ": {
          const m = tokBigInt(tokList(v)?.[0] ?? v);
          if (m !== undefined) msg.modseq = m;
          break;
        }
        case "X-GM-LABELS":
          msg.labels = (tokList(v) ?? [])
            .map((t) => tokString(t))
            .filter((s): s is string => s !== null)
            .map((s) => (s.startsWith("\\") ? s : decodeModifiedUtf7(s)));
          break;
        case "RFC822":
          msg.source = tokBytes(v);
          break;
        case "RFC822.HEADER":
          msg.headers = tokBytes(v);
          break;
        case "RFC822.TEXT":
          msg.parts["TEXT"] = tokBytes(v);
          break;
        default: {
          const m = /^(?:BODY|BINARY)(?:\.PEEK)?\[(.*)\](?:<\d+>)?$/s.exec(key);
          if (!m) break;
          const section = m[1]!;
          const bytes = tokBytes(v);
          if (section === "") msg.source = bytes;
          else if (section.startsWith("HEADER")) {
            if (!query || query.headers) msg.headers = bytes;
            if (query?.bodyParts?.some((p) => p.toUpperCase() === section)) msg.parts[section] = bytes;
          } else msg.parts[section] = bytes;
        }
      }
    }
    return msg;
  }

  /**
   * Stream messages. Each FETCH response is yielded as soon as it is complete; the
   * whole range is never buffered (reading pauses when the consumer falls behind).
   * Breaking out of the loop is safe: the rest of the response is drained and dropped.
   */
  fetch(range: string | number | number[], query: FetchQuery = {}, opts: { uid?: boolean } = {}): AsyncIterable<FetchedMessage> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      [Symbol.asyncIterator]() {
        return self.fetchGen(range, query, opts);
      },
    };
  }

  /** Convenience: collect `fetch()` into an array. */
  async fetchAll(range: string | number | number[], query: FetchQuery = {}, opts: { uid?: boolean } = {}): Promise<FetchedMessage[]> {
    const out: FetchedMessage[] = [];
    for await (const m of this.fetch(range, query, opts)) out.push(m);
    return out;
  }

  private async *fetchGen(range: string | number | number[], query: FetchQuery, opts: { uid?: boolean }): AsyncGenerator<FetchedMessage> {
    if (Array.isArray(range) && range.length === 0) return;
    const uid = opts.uid !== false;
    const set = toSequenceSet(range);
    const { items, extra } = this.buildFetchItems(query);
    const args: CommandArg[] = uid ? ["UID", "FETCH"] : ["FETCH"];
    args.push(set, "(" + items.join(" ") + ")");
    if (query.changedSince !== undefined && this.capabilities.has("CONDSTORE")) {
      args.push(`(CHANGEDSINCE ${BigInt(query.changedSince).toString()})`);
    }
    const buffer: FetchedMessage[] = [];
    let head = 0;
    let done = false;
    let error: Error | null = null;
    let cancelled = false;
    let paused = false;
    let wake: (() => void) | null = null;
    const notify = () => {
      const w = wake;
      wake = null;
      w?.();
    };
    const onlyFlagItems = (r: ImapResponse) => {
      const list = tokList(r.attributes[0]) ?? [];
      for (let i = 0; i < list.length; i += 2) {
        const k = (tokString(list[i]) ?? "").toUpperCase();
        if (k !== "FLAGS" && k !== "UID" && k !== "MODSEQ") return false;
      }
      return true;
    };
    const p = this.exec(args, {
      collect: false,
      untagged: (r) => {
        if (r.type !== "FETCH") return false;
        // unsolicited flag change from another session → let it become an event
        if (extra.size && onlyFlagItems(r)) return false;
        if (cancelled) return true;
        buffer.push(this.parseFetch(r, query));
        if (!paused && buffer.length - head >= FETCH_HIGH_WATER) {
          paused = true;
          this.pauseReading();
        }
        notify();
        return true;
      },
    });
    p.then(
      () => {
        done = true;
        notify();
      },
      (e: Error) => {
        error = e;
        done = true;
        notify();
      },
    );
    try {
      for (;;) {
        if (head < buffer.length) {
          const m = buffer[head]!;
          buffer[head++] = undefined as unknown as FetchedMessage;
          if (head > 1024 && head * 2 > buffer.length) {
            buffer.splice(0, head);
            head = 0;
          }
          if (paused && buffer.length - head < FETCH_HIGH_WATER / 2) {
            paused = false;
            this.resumeReading();
          }
          yield m;
          continue;
        }
        if (done) {
          if (error) throw error;
          return;
        }
        await new Promise<void>((resolve) => (wake = resolve));
      }
    } finally {
      cancelled = true;
      buffer.length = 0;
      head = 0;
      if (paused) {
        paused = false;
        this.resumeReading();
      }
      p.catch(() => undefined);
    }
  }

  // ---- flags / copy / move / expunge / append ---------------------------

  async store(
    range: string | number | number[],
    ops: { add?: string[]; remove?: string[]; set?: string[] },
    opts: { uid?: boolean; silent?: boolean; unchangedSince?: bigint | number } = {},
  ): Promise<StoreResult> {
    const uid = opts.uid !== false;
    const silent = opts.silent !== false;
    const set = toSequenceSet(range);
    const result: StoreResult = new Map<number, string[]>();
    const steps: [string, string[]][] = [];
    if (ops.set) steps.push(["FLAGS", ops.set]);
    if (ops.add?.length) steps.push(["+FLAGS", ops.add]);
    if (ops.remove?.length) steps.push(["-FLAGS", ops.remove]);
    for (const [item, flags] of steps) {
      const args: CommandArg[] = uid ? ["UID", "STORE", set] : ["STORE", set];
      if (opts.unchangedSince !== undefined) args.push(`(UNCHANGEDSINCE ${BigInt(opts.unchangedSince).toString()})`);
      args.push(item + (silent ? ".SILENT" : ""), flagList(flags));
      const res = await this.exec(args, {
        untagged: (r) => {
          if (r.type !== "FETCH") return false;
          const m = this.parseFetch(r);
          const key = uid && m.uid ? m.uid : m.seq;
          if (m.flags) result.set(key, m.flags);
          return true;
        },
      });
      if (res.tagged.code?.name === "MODIFIED") {
        const s = codeArgString(res.tagged, 0);
        if (s) result.modified = [...(result.modified ?? []), ...expandSequenceSet(s)];
      }
    }
    return result;
  }

  private copyUid(responses: ImapResponse[]): CopyResult {
    for (const r of responses) {
      if (r.code?.name !== "COPYUID") continue;
      const out: CopyResult = {};
      const v = tokNumber(r.code.args[0]);
      if (v !== undefined) out.uidValidity = v;
      const src = codeArgString(r, 1);
      const dst = codeArgString(r, 2);
      if (src) out.sourceUids = expandSequenceSet(src);
      if (dst) out.destUids = expandSequenceSet(dst);
      return out;
    }
    return {};
  }

  async copy(range: string | number | number[], dest: string, opts: { uid?: boolean } = {}): Promise<CopyResult> {
    const uid = opts.uid !== false;
    const set = toSequenceSet(range);
    const res = await this.exec([...(uid ? ["UID", "COPY"] : ["COPY"]), set, mailboxArg(dest)]);
    return this.copyUid([res.tagged, ...res.untagged]);
  }

  /**
   * MOVE (RFC 6851). Without MOVE: COPY + STORE \Deleted + UID EXPUNGE (UIDPLUS).
   * Caveat: without UIDPLUS (or with `uid: false`) the fallback uses plain EXPUNGE,
   * which also removes any OTHER message already flagged \Deleted in the mailbox.
   */
  async move(range: string | number | number[], dest: string, opts: { uid?: boolean } = {}): Promise<CopyResult> {
    const uid = opts.uid !== false;
    const set = toSequenceSet(range);
    if (this.capabilities.has("MOVE")) {
      const res = await this.exec([...(uid ? ["UID", "MOVE"] : ["MOVE"]), set, mailboxArg(dest)]);
      return this.copyUid([res.tagged, ...res.untagged]);
    }
    const copied = await this.copy(set, dest, { uid });
    await this.store(set, { add: ["\\Deleted"] }, { uid });
    if (uid && this.capabilities.has("UIDPLUS")) await this.exec(["UID", "EXPUNGE", set]);
    else await this.exec(["EXPUNGE"]);
    return copied;
  }

  /** EXPUNGE, or UID EXPUNGE <range> when a range is given and UIDPLUS is advertised. Returns expunged sequence numbers. */
  async expunge(range?: string | number | number[]): Promise<number[]> {
    const args: CommandArg[] = range !== undefined && this.capabilities.has("UIDPLUS") ? ["UID", "EXPUNGE", toSequenceSet(range)] : ["EXPUNGE"];
    const res = await this.exec(args);
    return res.untagged.filter((r) => r.type === "EXPUNGE").map((r) => r.number ?? 0);
  }

  async append(path: string, raw: string | Uint8Array, opts: { flags?: string[]; date?: Date } = {}): Promise<AppendResult> {
    const bytes = typeof raw === "string" ? Buffer.from(raw, "utf8") : raw;
    const args: CommandArg[] = ["APPEND", mailboxArg(path)];
    if (opts.flags?.length) args.push(flagList(opts.flags));
    if (opts.date) args.push(`"${formatInternalDate(opts.date)}"`);
    args.push(bytes);
    const res = await this.exec(args);
    const out: AppendResult = {};
    for (const r of [res.tagged, ...res.untagged]) {
      if (r.code?.name === "APPENDUID") {
        const v = tokNumber(r.code.args[0]);
        const u = tokNumber(r.code.args[1]);
        if (v !== undefined) out.uidValidity = v;
        if (u !== undefined) out.uid = u;
      }
    }
    return out;
  }

  // ---- quota ------------------------------------------------------------

  private parseQuotas(responses: ImapResponse[]): Quota[] {
    const out: Quota[] = [];
    for (const r of responses) {
      if (r.type !== "QUOTA") continue;
      const root = tokString(r.attributes[0]) ?? "";
      const list = tokList(r.attributes[1]) ?? [];
      const resources: Quota["resources"] = {};
      for (let i = 0; i + 2 < list.length; i += 3) {
        const name = (tokString(list[i]) ?? "").toUpperCase();
        resources[name] = { usage: tokNumber(list[i + 1]) ?? 0, limit: tokNumber(list[i + 2]) ?? 0 };
      }
      out.push({ root, resources });
    }
    return out;
  }

  async getQuota(root = ""): Promise<Quota[]> {
    const res = await this.exec(["GETQUOTA", encodeString(root)]);
    return this.parseQuotas(res.untagged);
  }

  async getQuotaRoot(path: string): Promise<Quota[]> {
    const res = await this.exec(["GETQUOTAROOT", mailboxArg(path)]);
    return this.parseQuotas(res.untagged);
  }

  // ---- IDLE -------------------------------------------------------------

  /**
   * Wait for mailbox changes. Resolves when `signal` aborts (or the client is closed
   * deliberately). Uses IDLE (re-issued every `refreshMs`), else NOOP polling.
   * Other commands issued meanwhile interrupt IDLE automatically and IDLE resumes after.
   */
  async idle(opts: IdleOptions = {}): Promise<void> {
    const { onEvent, signal } = opts;
    const pollMs = opts.pollIntervalMs ?? 60_000;
    const refreshMs = opts.refreshMs ?? 29 * 60_000;
    if (signal?.aborted) return;
    const sink = onEvent ? (e: ImapEvent) => onEvent(e) : null;
    if (sink) this.eventSinks.add(sink);
    try {
      while (!signal?.aborted && this.usable) {
        if (this.capabilities.has("IDLE")) {
          try {
            await this.idleOnce(refreshMs, signal);
          } catch (e) {
            if (e instanceof ImapCommandError) {
              // e.g. Exchange configs that advertise but refuse IDLE → poll instead
              this.capabilities.delete("IDLE");
              continue;
            }
            throw e;
          }
        } else {
          await this.noop();
          await new Promise<void>((resolve) => {
            const t = setTimeout(done, pollMs);
            function done() {
              clearTimeout(t);
              signal?.removeEventListener("abort", done);
              resolve();
            }
            signal?.addEventListener("abort", done, { once: true });
          });
        }
      }
    } catch (e) {
      if (this.closing && e instanceof ImapNetworkError) return;
      throw e;
    } finally {
      if (sink) this.eventSinks.delete(sink);
    }
  }

  private idleOnce(refreshMs: number, signal?: AbortSignal): Promise<void> {
    let continued = false;
    let wantDone = false;
    let doneSent = false;
    let cmd: Pending | null = null;
    const sendDone = () => {
      if (doneSent) return;
      if (!continued) {
        wantDone = true;
        return;
      }
      doneSent = true;
      cmd = this.current;
      if (cmd && cmd.opts.idle) {
        cmd.timedOutAllowed = true;
        this.armTimer();
      }
      this.write(Buffer.from("DONE\r\n"), "C: DONE");
    };
    const timer = setTimeout(sendDone, refreshMs);
    const onAbort = () => sendDone();
    signal?.addEventListener("abort", onAbort, { once: true });
    const p = this.exec(["IDLE"], {
      idle: true,
      collect: false,
      onContinuation: () => {
        continued = true;
        this.idleBreak = sendDone;
        if (wantDone || this.queue.length || signal?.aborted) sendDone();
      },
    });
    return p
      .then(() => undefined)
      .finally(() => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        if (this.idleBreak === sendDone) this.idleBreak = null;
      });
  }
}

/** Create a client (call `connect()` next). */
export function createImapClient(opts: ImapClientOptions): ImapClient {
  return new ImapClient(opts);
}
