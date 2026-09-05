import { describe, it, expect } from "vitest";
import { initiate, lookup, KhaltiError, KHALTI_BASE_URLS } from "./index";

interface Captured {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Build a fake fetch that records the request and returns a canned response. */
function fakeFetch(
  status: number,
  responseBody: unknown,
  sink: Partial<Captured>,
): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    sink.url = url;
    sink.method = init?.method;
    sink.headers = (init?.headers ?? {}) as Record<string, string>;
    sink.body = init?.body ? JSON.parse(init.body as string) : undefined;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (responseBody === undefined ? "" : JSON.stringify(responseBody)),
    };
  }) as unknown as typeof fetch;
}

describe("initiate", () => {
  it("POSTs to the initiate endpoint with Key auth and JSON body", async () => {
    const cap: Partial<Captured> = {};
    const res = await initiate(
      {
        return_url: "https://me/return",
        website_url: "https://me",
        amount: 1000,
        purchase_order_id: "order-42",
        purchase_order_name: "Test order",
      },
      {
        secretKey: "test-secret-key",
        env: "test",
        fetch: fakeFetch(200, {
          pidx: "abc123",
          payment_url: "https://a.khalti.com/pay/abc123",
          expires_at: "2026-01-01T00:00:00Z",
          expires_in: 1800,
        }, cap),
      },
    );

    expect(cap.url).toBe(`${KHALTI_BASE_URLS.test}/epayment/initiate/`);
    expect(cap.method).toBe("POST");
    expect(cap.headers?.Authorization).toBe("Key test-secret-key");
    expect(cap.headers?.["Content-Type"]).toBe("application/json");
    expect((cap.body as Record<string, unknown>).amount).toBe(1000);
    expect((cap.body as Record<string, unknown>).purchase_order_id).toBe("order-42");

    expect(res.pidx).toBe("abc123");
    expect(res.payment_url).toContain("abc123");
  });

  it("uses the prod base URL when env=prod", async () => {
    const cap: Partial<Captured> = {};
    await initiate(
      {
        return_url: "https://me/return",
        website_url: "https://me",
        amount: 500,
        purchase_order_id: "o1",
        purchase_order_name: "n",
      },
      { secretKey: "k", env: "prod", fetch: fakeFetch(200, { pidx: "x" }, cap) },
    );
    expect(cap.url?.startsWith(KHALTI_BASE_URLS.prod)).toBe(true);
  });

  it("throws KhaltiError with parsed detail on a 400", async () => {
    const cap: Partial<Captured> = {};
    await expect(
      initiate(
        {
          return_url: "https://me/return",
          website_url: "https://me",
          amount: 10,
          purchase_order_id: "o1",
          purchase_order_name: "n",
        },
        {
          secretKey: "k",
          fetch: fakeFetch(400, { detail: "Amount should be greater than Rs. 1." }, cap),
        },
      ),
    ).rejects.toMatchObject({
      name: "KhaltiError",
      status: 400,
      detail: "Amount should be greater than Rs. 1.",
      message: "Amount should be greater than Rs. 1.",
    });
  });

  it("the thrown error is an instanceof KhaltiError", async () => {
    let caught: unknown;
    try {
      await initiate(
        {
          return_url: "https://me/return",
          website_url: "https://me",
          amount: 10,
          purchase_order_id: "o1",
          purchase_order_name: "n",
        },
        { secretKey: "k", fetch: fakeFetch(401, { detail: "Invalid token." }, {}) },
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(KhaltiError);
    expect((caught as KhaltiError).status).toBe(401);
  });
});

describe("lookup", () => {
  it("POSTs { pidx } to the lookup endpoint and returns the parsed status", async () => {
    const cap: Partial<Captured> = {};
    const res = await lookup("abc123", {
      secretKey: "sk",
      env: "test",
      fetch: fakeFetch(200, {
        pidx: "abc123",
        total_amount: 1000,
        status: "Completed",
        transaction_id: "txn-9",
        fee: 0,
        refunded: false,
      }, cap),
    });

    expect(cap.url).toBe(`${KHALTI_BASE_URLS.test}/epayment/lookup/`);
    expect(cap.method).toBe("POST");
    expect(cap.headers?.Authorization).toBe("Key sk");
    expect((cap.body as Record<string, unknown>).pidx).toBe("abc123");

    expect(res.status).toBe("Completed");
    expect(res.transaction_id).toBe("txn-9");
    expect(res.total_amount).toBe(1000);
  });

  it("throws KhaltiError on a non-2xx lookup", async () => {
    await expect(
      lookup("nope", { secretKey: "sk", fetch: fakeFetch(404, { detail: "Not found." }, {}) }),
    ).rejects.toBeInstanceOf(KhaltiError);
  });
});
