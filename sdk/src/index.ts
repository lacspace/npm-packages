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

/** Override the default e-commerce base paths (defaults: products/cart/checkout). */
export interface EcommercePaths {
  products?: string;
  cart?: string;
  checkout?: string;
}

export interface LacspaceSDKOptions extends LacspaceApiOptions {
  /** Override the default e-commerce endpoint paths. Defaults unchanged when omitted. */
  ecommerce?: EcommercePaths;
}

export class LacspaceSDK {
  readonly api: LacspaceApi;
  readonly auth: LacspaceAuth;
  readonly analytics: LacspaceAnalytics;

  constructor(options: LacspaceSDKOptions = {}) {
    this.api = new LacspaceApi(options);
    this.auth = new LacspaceAuth({ api: this.api });
    this.analytics = new LacspaceAnalytics({ api: this.api });
    const productsPath = options.ecommerce?.products ?? "products";
    const cartPath = options.ecommerce?.cart ?? "cart";
    const checkoutPath = options.ecommerce?.checkout ?? "checkout";
    this.ecommerce = {
      getProducts: (): Promise<Product[]> => this.api.get<Product[]>(productsPath),
      getProduct: (id: string): Promise<Product> => this.api.get<Product>(`${productsPath}/${id}`),
      addToCart: (item: CartItem): Promise<void> => this.api.post<void>(cartPath, item),
      checkout: (cartId: string): Promise<CheckoutResult> =>
        this.api.post<CheckoutResult>(checkoutPath, { cartId }),
    };
  }

  readonly ecommerce: {
    getProducts: () => Promise<Product[]>;
    getProduct: (id: string) => Promise<Product>;
    addToCart: (item: CartItem) => Promise<void>;
    checkout: (cartId: string) => Promise<CheckoutResult>;
  };
}

export function createClient(options?: LacspaceSDKOptions): LacspaceSDK {
  return new LacspaceSDK(options);
}

export default LacspaceSDK;

/* ------------------------------------------------------------------ *
 * New in 2.2.0 — pure, injectable client utilities.
 * Everything above is unchanged; these are strictly additive.
 * ------------------------------------------------------------------ */

export {
  LACSPACE_ENVIRONMENTS,
  resolveEnvironment,
  mergeConfig,
  configFromEnvironment,
  type LacspaceEnvironment,
  type EnvironmentPreset,
  type ClientConfigLike,
} from "./environments";

export {
  createCorrelationId,
  createIdempotencyKey,
  correlationHeaders,
  createRequestContext,
  contextElapsedMs,
  type RandomSource,
  type CorrelationOptions,
  type SdkRequestContext,
  type RequestContextOptions,
} from "./context";

export {
  SDK_VERSION,
  normalizeError,
  isRetryableError,
  checkHealth,
  paginate,
  collectPages,
  type ErrorKind,
  type NormalizedError,
  type HealthResult,
  type HealthCheckOptions,
  type PageResult,
  type PageFetcher,
  type PaginateOptions,
} from "./runtime";

import { configFromEnvironment, type LacspaceEnvironment, type EnvironmentPreset } from "./environments";

/**
 * Create a fully-wired {@link LacspaceSDK} for a named environment
 * (production / staging / development / local). Your `options` win over the
 * environment preset (base URL, headers, …).
 */
export function createClientForEnvironment(
  env: LacspaceEnvironment | EnvironmentPreset,
  options?: LacspaceSDKOptions,
): LacspaceSDK {
  return new LacspaceSDK(configFromEnvironment<LacspaceSDKOptions>(env, options));
}
