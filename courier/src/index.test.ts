import { describe, it, expect } from "vitest";
import {
  DELIVERY_TRANSITIONS,
  canTransition,
  isTerminal,
  transition,
  CourierError,
  normalizePathaoStatus,
  parsePathaoWebhook,
  verifyWebhookSignature,
  verifyPathaoWebhook,
  createPathaoAdapter,
  PATHAO_PROD_BASE_URL,
  PATHAO_WEBHOOK_ACK_HEADER,
  type DeliveryStatus,
} from "./index";

/* ------------------------------------------------------------------ *
 * Test-local HMAC-SHA256 hex (independent of the library's helper)
 * ------------------------------------------------------------------ */
async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("delivery state machine", () => {
  it("allows valid forward transitions", () => {
    expect(canTransition("pending", "confirmed")).toBe(true);
    expect(canTransition("confirmed", "picked_up")).toBe(true);
    expect(canTransition("picked_up", "in_transit")).toBe(true);
    expect(canTransition("out_for_delivery", "delivered")).toBe(true);
    expect(canTransition("on_hold", "in_transit")).toBe(true);
  });

  it("rejects illegal transitions", () => {
    expect(canTransition("pending", "delivered")).toBe(false);
    expect(canTransition("delivered", "returned")).toBe(false);
    expect(canTransition("confirmed", "pending")).toBe(false);
  });

  it("identifies terminal states", () => {
    expect(isTerminal("delivered")).toBe(true);
    expect(isTerminal("returned")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("pending")).toBe(false);
    expect(isTerminal("in_transit")).toBe(false);
  });

  it("every status has a transition entry", () => {
    const statuses = Object.keys(DELIVERY_TRANSITIONS) as DeliveryStatus[];
    expect(statuses.length).toBe(10);
    for (const s of statuses) expect(Array.isArray(DELIVERY_TRANSITIONS[s])).toBe(true);
  });

  it("transition() returns a NEW object with updated status", () => {
    const order = { id: "A1", status: "pending" as DeliveryStatus };
    const next = transition(order, "confirmed");
    expect(next).not.toBe(order);
    expect(next.status).toBe("confirmed");
    expect(next.id).toBe("A1");
    expect(order.status).toBe("pending"); // original untouched
  });

  it("transition() throws CourierError on an illegal move", () => {
    const order = { status: "pending" as DeliveryStatus };
    expect(() => transition(order, "delivered")).toThrow(CourierError);
    try {
      transition(order, "delivered");
    } catch (e) {
      expect((e as CourierError).code).toBe("illegal_transition");
    }
  });
});

describe("normalizePathaoStatus", () => {
  it("maps known events", () => {
    expect(normalizePathaoStatus("order.picked")).toBe("picked_up");
    expect(normalizePathaoStatus("order.delivered")).toBe("delivered");
    expect(normalizePathaoStatus("order.in-transit")).toBe("in_transit");
    expect(normalizePathaoStatus("order.assigned-for-delivery")).toBe("out_for_delivery");
    expect(normalizePathaoStatus("order.on-hold")).toBe("on_hold");
    expect(normalizePathaoStatus("order.returned")).toBe("returned");
  });

  it("returns undefined for unknown events", () => {
    expect(normalizePathaoStatus("order.teleported")).toBeUndefined();
    expect(normalizePathaoStatus("")).toBeUndefined();
  });
});

describe("parsePathaoWebhook", () => {
  it("parses from a JSON string and pulls consignmentId", () => {
    const body = JSON.stringify({
      event: "order.delivered",
      consignment_id: "DA240101ABC",
      merchant_order_id: "SHOP-42",
    });
    const parsed = parsePathaoWebhook(body);
    expect(parsed.status).toBe("delivered");
    expect(parsed.consignmentId).toBe("DA240101ABC");
    expect(parsed.merchantOrderId).toBe("SHOP-42");
    expect(parsed.raw.event).toBe("order.delivered");
  });

  it("parses from an object", () => {
    const parsed = parsePathaoWebhook({ event: "order.picked", consignment_id: "X1" });
    expect(parsed.status).toBe("picked_up");
    expect(parsed.consignmentId).toBe("X1");
    expect(parsed.merchantOrderId).toBeUndefined();
  });

  it("throws on an unknown event", () => {
    expect(() => parsePathaoWebhook({ event: "order.nope" })).toThrow(CourierError);
  });

  it("throws on invalid JSON", () => {
    expect(() => parsePathaoWebhook("{not json")).toThrow(CourierError);
  });

  it("throws when event field is missing", () => {
    expect(() => parsePathaoWebhook({ consignment_id: "X1" })).toThrow(CourierError);
  });
});

describe("verifyWebhookSignature", () => {
  it("accepts a correct HMAC-SHA256 hex signature", async () => {
    const secret = "whsec_test";
    const payload = JSON.stringify({ event: "order.delivered", consignment_id: "X1" });
    const sig = await hmacHex(secret, payload);
    expect(await verifyWebhookSignature(payload, sig, secret)).toBe(true);
  });

  it("rejects a wrong signature", async () => {
    const secret = "whsec_test";
    const payload = "hello";
    const wrong = await hmacHex("other_secret", payload);
    expect(await verifyWebhookSignature(payload, wrong, secret)).toBe(false);
  });
});

describe("verifyPathaoWebhook", () => {
  it("accepts a matching secret", () => {
    expect(verifyPathaoWebhook({ headerSecret: "s3cr3t", expectedSecret: "s3cr3t" })).toBe(true);
  });
  it("rejects a mismatched secret", () => {
    expect(verifyPathaoWebhook({ headerSecret: "nope", expectedSecret: "s3cr3t" })).toBe(false);
  });
  it("rejects a null/undefined header", () => {
    expect(verifyPathaoWebhook({ headerSecret: null, expectedSecret: "s3cr3t" })).toBe(false);
    expect(verifyPathaoWebhook({ headerSecret: undefined, expectedSecret: "s3cr3t" })).toBe(false);
  });
  it("exposes the ack header constant", () => {
    expect(PATHAO_WEBHOOK_ACK_HEADER).toBe("X-Pathao-Merchant-Webhook-Integration-Secret");
  });
});

describe("createPathaoAdapter", () => {
  function stubFetch(responses: Array<{ ok?: boolean; status?: number; json: unknown }>) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    let i = 0;
    const fn = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      const r = responses[Math.min(i, responses.length - 1)]!;
      i++;
      return {
        ok: r.ok ?? true,
        status: r.status ?? 200,
        statusText: "",
        json: async () => r.json,
        text: async () => JSON.stringify(r.json),
      } as Response;
    }) as unknown as typeof fetch;
    return { fn, calls };
  }

  const baseConfig = {
    clientId: "cid",
    clientSecret: "csecret",
    username: "u@shop.np",
    password: "pw",
    storeId: 99,
  };

  it("issueToken posts to /issue-token and caches the token", async () => {
    const { fn, calls } = stubFetch([
      { json: { access_token: "TOK123", expires_in: 3600 } },
    ]);
    const adapter = createPathaoAdapter({ ...baseConfig, fetch: fn });
    const tok = await adapter.issueToken();
    expect(tok).toBe("TOK123");
    expect(calls[0]!.url).toBe(`${PATHAO_PROD_BASE_URL}/aladdin/api/v1/issue-token`);
    expect(calls[0]!.init.method).toBe("POST");
    const sentBody = JSON.parse(calls[0]!.init.body as string);
    expect(sentBody.grant_type).toBe("password");
    expect(sentBody.client_id).toBe("cid");
  });

  it("createOrder posts to /orders with a Bearer token and maps consignment_id", async () => {
    const { fn, calls } = stubFetch([
      { json: { access_token: "TOK123", expires_in: 3600 } },
      { json: { data: { consignment_id: "DA99", order_status: "Pending" } } },
    ]);
    const adapter = createPathaoAdapter({ ...baseConfig, fetch: fn });
    const shipment = await adapter.createOrder({
      recipientName: "Ram",
      recipientPhone: "9800000000",
      recipientAddress: "Kathmandu",
      cityId: 1,
      zoneId: 2,
      areaId: 3,
      amountToCollect: 1500,
      itemQuantity: 1,
      itemWeight: 0.5,
      description: "T-shirt",
      merchantOrderId: "SHOP-7",
    });
    expect(shipment.trackingId).toBe("DA99");
    expect(shipment.status).toBe("confirmed");
    expect(shipment.carrier).toBe("pathao");

    // One token call, then the order call with the Bearer header.
    const orderCall = calls[1]!;
    expect(orderCall.url).toBe(`${PATHAO_PROD_BASE_URL}/aladdin/api/v1/orders`);
    const headers = orderCall.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer TOK123");
    const body = JSON.parse(orderCall.init.body as string);
    expect(body.store_id).toBe(99);
    expect(body.amount_to_collect).toBe(1500);
    expect(body.merchant_order_id).toBe("SHOP-7");
    expect(body.delivery_type).toBe(48);
  });

  it("reuses the cached token across calls", async () => {
    const { fn, calls } = stubFetch([
      { json: { access_token: "TOK123", expires_in: 3600 } },
      { json: { data: { consignment_id: "DA1" } } },
      { json: { data: { consignment_id: "DA2" } } },
    ]);
    const adapter = createPathaoAdapter({ ...baseConfig, fetch: fn });
    const input = {
      recipientName: "A",
      recipientPhone: "9800000000",
      recipientAddress: "KTM",
      amountToCollect: 0,
      itemQuantity: 1,
      itemWeight: 0.5,
      description: "x",
    };
    await adapter.createOrder(input);
    await adapter.createOrder(input);
    // 1 token issue + 2 orders == 3 calls (token was cached).
    expect(calls.length).toBe(3);
  });

  it("throws CourierError with status on a non-2xx", async () => {
    const { fn } = stubFetch([
      { json: { access_token: "TOK123", expires_in: 3600 } },
      { ok: false, status: 422, json: { message: "invalid recipient_zone" } },
    ]);
    const adapter = createPathaoAdapter({ ...baseConfig, fetch: fn });
    await expect(
      adapter.createOrder({
        recipientName: "A",
        recipientPhone: "9800000000",
        recipientAddress: "KTM",
        amountToCollect: 0,
        itemQuantity: 1,
        itemWeight: 0.5,
        description: "x",
      }),
    ).rejects.toMatchObject({ name: "CourierError", status: 422 });
  });

  it("track() throws an unsupported CourierError", async () => {
    const { fn } = stubFetch([{ json: {} }]);
    const adapter = createPathaoAdapter({ ...baseConfig, fetch: fn });
    await expect(adapter.track("DA99")).rejects.toMatchObject({ code: "unsupported" });
  });
});
