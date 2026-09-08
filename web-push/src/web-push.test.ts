import { describe, it, expect } from "vitest";
import {
  generateVapidKeys,
  createVapidHeaders,
  encryptPayload,
  sendNotification,
  isSubscriptionExpired,
  toBase64url,
  fromBase64url,
  PushError,
} from "./index";

// The official worked example from RFC 8291 §5. Our encrypted body must match
// this byte-for-byte — the value was independently confirmed against http_ece
// (the reference implementation by the RFC's author) on these exact inputs.
const RFC8291 = {
  plaintext: "When I grow up, I want to be a watermelon",
  p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  expectedBody:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

describe("encryptPayload (RFC 8291 aes128gcm)", () => {
  it("reproduces the RFC 8291 test vector byte-for-byte", async () => {
    const { body, salt, serverPublicKey } = await encryptPayload(
      RFC8291.plaintext,
      { p256dh: RFC8291.p256dh, auth: RFC8291.auth },
      { salt: RFC8291.salt, serverKeys: { publicKey: RFC8291.asPublic, privateKey: RFC8291.asPrivate } },
    );
    expect(toBase64url(body)).toBe(RFC8291.expectedBody);
    expect(salt).toBe(RFC8291.salt);
    expect(serverPublicKey).toBe(RFC8291.asPublic);
  });

  it("uses a fresh random salt + ephemeral key each time (bodies differ)", async () => {
    const keys = { p256dh: RFC8291.p256dh, auth: RFC8291.auth };
    const a = await encryptPayload("hello", keys);
    const b = await encryptPayload("hello", keys);
    expect(toBase64url(a.body)).not.toBe(toBase64url(b.body));
    expect(a.salt).not.toBe(b.salt);
  });

  it("throws PushError when the payload can't fit one record", async () => {
    const big = "x".repeat(5000);
    await expect(encryptPayload(big, { p256dh: RFC8291.p256dh, auth: RFC8291.auth })).rejects.toBeInstanceOf(
      PushError,
    );
  });
});

describe("VAPID (RFC 8292)", () => {
  it("generates a usable P-256 key pair", async () => {
    const { publicKey, privateKey } = await generateVapidKeys();
    expect(fromBase64url(publicKey).length).toBe(65); // uncompressed point
    expect(fromBase64url(publicKey)[0]).toBe(4);
    expect(fromBase64url(privateKey).length).toBe(32);
  });

  it("signs a verifiable ES256 JWT with the right claims", async () => {
    const { publicKey, privateKey } = await generateVapidKeys();
    const { Authorization } = await createVapidHeaders(
      "https://push.example.net",
      { subject: "mailto:dev@lacspace.com", publicKey, privateKey },
      2_000_000_000,
    );

    const match = /^vapid t=(.+), k=(.+)$/.exec(Authorization);
    expect(match).toBeTruthy();
    const [, jwt, k] = match!;
    expect(k).toBe(publicKey);

    const [h, p, s] = jwt!.split(".");
    const header = JSON.parse(new TextDecoder().decode(fromBase64url(h!)));
    const claims = JSON.parse(new TextDecoder().decode(fromBase64url(p!)));
    expect(header).toEqual({ typ: "JWT", alg: "ES256" });
    expect(claims.aud).toBe("https://push.example.net");
    expect(claims.sub).toBe("mailto:dev@lacspace.com");
    expect(claims.exp).toBe(2_000_000_000);

    // The signature must verify against the VAPID public key.
    const pub = fromBase64url(publicKey);
    const key = await crypto.subtle.importKey(
      "raw",
      pub as BufferSource,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      fromBase64url(s!) as BufferSource,
      new TextEncoder().encode(`${h}.${p}`) as BufferSource,
    );
    expect(ok).toBe(true);
  });
});

describe("helpers", () => {
  it("base64url round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect([...fromBase64url(toBase64url(bytes))]).toEqual([...bytes]);
  });

  it("flags gone subscriptions", () => {
    expect(isSubscriptionExpired(404)).toBe(true);
    expect(isSubscriptionExpired(410)).toBe(true);
    expect(isSubscriptionExpired(201)).toBe(false);
  });

  it("sendNotification POSTs an encrypted body with VAPID + aes128gcm headers", async () => {
    const captured: { url?: string; init?: RequestInit } = {};
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      captured.url = url;
      captured.init = init;
      return new Response("", { status: 201 });
    }) as unknown as typeof fetch;

    try {
      const { publicKey, privateKey } = await generateVapidKeys();
      const res = await sendNotification(
        { endpoint: "https://push.example.net/x/abc", keys: { p256dh: RFC8291.p256dh, auth: RFC8291.auth } },
        JSON.stringify({ title: "Hi" }),
        { vapid: { subject: "mailto:dev@lacspace.com", publicKey, privateKey } },
      );
      expect(res.statusCode).toBe(201);
      const headers = captured.init!.headers as Record<string, string>;
      expect(headers["Content-Encoding"]).toBe("aes128gcm");
      expect(headers["Authorization"]).toMatch(/^vapid t=.+, k=.+$/);
      expect(headers["TTL"]).toBeTruthy();
      expect(captured.init!.body).toBeInstanceOf(Uint8Array);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
