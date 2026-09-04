import { test, expect } from "vitest";
import { LacspaceSDK, createClient } from "./index";

// Fake fetch that records requested URLs and returns an empty JSON array/object.
function recordingFetch(urls: string[]): typeof fetch {
  return (async (input: string | URL | Request): Promise<Response> => {
    urls.push(typeof input === "string" ? input : input.toString());
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

test("api, auth and analytics are wired and share one api instance/token", () => {
  const sdk = new LacspaceSDK({ baseURL: "http://api.test" });
  expect(sdk.api).toBeDefined();
  expect(sdk.auth).toBeDefined();
  expect(sdk.analytics).toBeDefined();
  // Auth + analytics reuse the SDK's single api client.
  expect(sdk.auth.api).toBe(sdk.api);
  expect(sdk.analytics.api).toBe(sdk.api);

  // A token set on the api propagates to auth (which reads from the same client).
  sdk.api.setToken("shared-token");
  expect(sdk.auth.getToken()).toBe("shared-token");
  expect(sdk.api.getToken()).toBe("shared-token");
});

test("default e-commerce base paths are used when omitted", async () => {
  const urls: string[] = [];
  const sdk = createClient({ baseURL: "http://api.test", fetch: recordingFetch(urls) });
  await sdk.ecommerce.getProducts();
  await sdk.ecommerce.getProduct("42");
  expect(urls[0]).toContain("/products");
  expect(urls[1]).toContain("/products/42");
});

test("custom e-commerce base paths override the defaults", async () => {
  const urls: string[] = [];
  const sdk = createClient({
    baseURL: "http://api.test",
    fetch: recordingFetch(urls),
    ecommerce: { products: "catalog", cart: "basket", checkout: "pay" },
  });
  await sdk.ecommerce.getProducts();
  await sdk.ecommerce.addToCart({ productId: "p1", quantity: 1 });
  await sdk.ecommerce.checkout("cart-1");
  expect(urls[0]).toContain("/catalog");
  expect(urls[0]).not.toContain("/products");
  expect(urls[1]).toContain("/basket");
  expect(urls[2]).toContain("/pay");
});
