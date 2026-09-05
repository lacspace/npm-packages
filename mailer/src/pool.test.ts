import { describe, it, expect } from "vitest";
import {
  Mailer,
  MailerPool,
  createMailer,
  createMailerPool,
  createTransport,
  type SmtpConfig,
  type Mail,
  type SendResult,
} from "./index";

const CFG: SmtpConfig = { host: "smtp.example.com", port: 587 };

const OK: SendResult = { messageId: "<id>", accepted: ["a@b.c"], response: "250 ok" };
const MAIL: Mail = { from: "s@x.com", to: "a@b.c", subject: "hi", text: "hi" };

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

/** A fake poolable connection whose sendReusable behaviour is supplied by the test. */
class FakeConn {
  constructor(private onSend: () => Promise<SendResult>) {}
  opened = 0;
  closed = 0;
  async open(): Promise<void> {
    this.opened++;
  }
  async sendReusable(_mail: Mail): Promise<SendResult> {
    return this.onSend();
  }
  // Transport surface (unused by the pool but required by the type):
  async send(_mail: Mail): Promise<SendResult> {
    return this.onSend();
  }
  async verify(): Promise<boolean> {
    return true;
  }
  async close(): Promise<void> {
    this.closed++;
  }
}

/** MailerPool whose connections are fakes produced by a supplied factory. */
class TestPool extends MailerPool {
  created: FakeConn[] = [];
  constructor(
    config: SmtpConfig,
    private factory: () => FakeConn,
  ) {
    super(config);
  }
  protected createConnection(): FakeConn {
    const c = this.factory();
    this.created.push(c);
    return c;
  }
}

describe("MailerPool rate limiting", () => {
  it("starts at most rateLimit sends per rateDelta window", async () => {
    const startTimes: number[] = [];
    const pool = new TestPool(
      { ...CFG, rateLimit: 2, rateDelta: 200 },
      () =>
        new FakeConn(async () => {
          startTimes.push(Date.now());
          return OK;
        }),
    );

    const t0 = Date.now();
    await Promise.all([pool.send(MAIL), pool.send(MAIL), pool.send(MAIL), pool.send(MAIL)]);

    expect(startTimes.length).toBe(4);
    // First two fire almost immediately.
    expect(startTimes[1]! - t0).toBeLessThan(120);
    // Third and fourth are held back until the first window expires (~200ms).
    expect(startTimes[2]! - t0).toBeGreaterThanOrEqual(180);
    expect(startTimes[3]! - t0).toBeGreaterThanOrEqual(180);

    await pool.close();
  });

  it("does not rate-limit when rateLimit is unset", async () => {
    const starts: number[] = [];
    const pool = new TestPool(
      { ...CFG },
      () =>
        new FakeConn(async () => {
          starts.push(Date.now());
          return OK;
        }),
    );
    const t0 = Date.now();
    await Promise.all([pool.send(MAIL), pool.send(MAIL), pool.send(MAIL)]);
    expect(starts.length).toBe(3);
    expect(Date.now() - t0).toBeLessThan(100);
    await pool.close();
  });
});

describe("MailerPool maxConnections", () => {
  it("never creates more than maxConnections and drains the queue", async () => {
    const gates: Array<(r: SendResult) => void> = [];
    const pool = new TestPool(
      { ...CFG, maxConnections: 2 },
      () => new FakeConn(() => new Promise<SendResult>((res) => gates.push(res))),
    );

    const results = Promise.all([
      pool.send(MAIL),
      pool.send(MAIL),
      pool.send(MAIL),
      pool.send(MAIL),
    ]);

    await tick();
    // Only 2 connections created; the other 2 sends wait in the queue.
    expect(pool.created.length).toBe(2);
    expect(gates.length).toBe(2);

    // Release sends one at a time; released connections are reused (no new fakes).
    let i = 0;
    while (i < 4) {
      await tick();
      gates[i]!(OK);
      i++;
    }

    await results;
    expect(pool.created.length).toBe(2); // stayed capped the whole time
    expect(gates.length).toBe(4); // all four sends ran

    await pool.close();
  });
});

describe("MailerPool connection reuse", () => {
  it("reuses an idle connection instead of creating a new one", async () => {
    const pool = new TestPool({ ...CFG }, () => new FakeConn(async () => OK));
    await pool.send(MAIL);
    await pool.send(MAIL);
    await pool.send(MAIL);
    expect(pool.created.length).toBe(1);
    await pool.close();
  });

  it("closes all connections on close()", async () => {
    const pool = new TestPool({ ...CFG }, () => new FakeConn(async () => OK));
    await pool.send(MAIL);
    const conn = pool.created[0]!;
    await pool.close();
    expect(conn.closed).toBeGreaterThanOrEqual(1);
    await expect(pool.send(MAIL)).rejects.toThrow();
  });
});

describe("HELO name + factories", () => {
  it("Mailer stores a configured HELO name", () => {
    const m = new Mailer({ ...CFG, name: "example.com" });
    expect(m.config.name).toBe("example.com");
  });

  it("createTransport picks pool vs plain mailer by config.pool", () => {
    expect(createTransport({ ...CFG, pool: true })).toBeInstanceOf(MailerPool);
    expect(createTransport({ ...CFG, pool: false })).toBeInstanceOf(Mailer);
    expect(createTransport({ ...CFG })).toBeInstanceOf(Mailer);
  });

  it("factory helpers return the expected classes", () => {
    expect(createMailer(CFG)).toBeInstanceOf(Mailer);
    expect(createMailerPool(CFG)).toBeInstanceOf(MailerPool);
  });
});
