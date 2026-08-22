/**
 * @lacspace/sdk — the high-level Lacspace SDK. Bundles `@lacspace/api`,
 * `@lacspace/auth` and `@lacspace/analytics` behind one client that shares a
 * single api instance (so a login token applies across auth, analytics and
 * e-commerce calls), plus convenience e-commerce helpers.
 */

import { LacspaceApi, type LacspaceApiOptions } from "@lacspace/api";
import { LacspaceAuth } from "@lacspace/auth";
import { LacspaceAnalytics } from "@lacspace/analytics";

export * from "@lacspace/api";
export * from "@lacspace/auth";
export * from "@lacspace/analytics";

export interface Product {
  id: string;
  name: string;
  price: number;
  [key: string]: unknown;
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface CheckoutResult {
  orderId: string;
  [key: string]: unknown;
}

export type LacspaceSDKOptions = LacspaceApiOptions;

export class LacspaceSDK {
  readonly api: LacspaceApi;
  readonly auth: LacspaceAuth;
  readonly analytics: LacspaceAnalytics;

  constructor(options: LacspaceSDKOptions = {}) {
    this.api = new LacspaceApi(options);
    this.auth = new LacspaceAuth({ api: this.api });
    this.analytics = new LacspaceAnalytics({ api: this.api });
  }

  readonly ecommerce = {
    getProducts: (): Promise<Product[]> => this.api.get<Product[]>("products"),
    getProduct: (id: string): Promise<Product> => this.api.get<Product>(`products/${id}`),
    addToCart: (item: CartItem): Promise<void> => this.api.post<void>("cart", item),
    checkout: (cartId: string): Promise<CheckoutResult> =>
      this.api.post<CheckoutResult>("checkout", { cartId }),
  };
}

export function createClient(options?: LacspaceSDKOptions): LacspaceSDK {
  return new LacspaceSDK(options);
}

export default LacspaceSDK;
