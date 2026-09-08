/**
 * @lacspace/web-push/client — the tiny browser half.
 *
 * Runs in the browser. It registers your service worker, asks the user for
 * notification permission, subscribes to push, and (optionally) POSTs the
 * subscription to your backend so the server half can push to it.
 *
 * Zero dependencies — just the standard `navigator`, `Notification` and
 * `PushManager` APIs. Safe to import in any frontend (Next.js, Vite, plain HTML).
 */

/** The shape you send to your server — matches `PushSubscription.toJSON()`. */
export interface PushSubscriptionJSON {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
}

export interface SubscribeOptions {
  /** Your VAPID public key (base64url) from `generateVapidKeys()` on the server. */
  vapidPublicKey: string;
  /** Path to your service worker file. Default "/sw.js". */
  serviceWorkerUrl?: string;
  /**
   * If set, the subscription JSON is POSTed here as `application/json`.
   * Your backend stores it and later calls `sendNotification`.
   */
  saveUrl?: string;
  /** Extra fetch init merged into the save request (e.g. credentials, headers). */
  saveInit?: RequestInit;
}

/** True if this browser can actually do web push at all. */
export function isPushSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** The current permission without prompting: "granted" | "denied" | "default". */
export function getPermission(): NotificationPermission {
  return typeof Notification !== "undefined" ? Notification.permission : "denied";
}

/** Prompt for notification permission. Returns the resulting permission. */
export async function askPermission(): Promise<NotificationPermission> {
  return Notification.requestPermission();
}

// VAPID public keys travel as base64url but `applicationServerKey` wants raw bytes.
function vapidToBytes(base64url: string): Uint8Array {
  const b64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, "=");
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * The one-call happy path: register SW → ask permission → subscribe → (save).
 * Throws if push is unsupported or the user denies permission.
 *
 * @example
 * const sub = await subscribeToPush({
 *   vapidPublicKey: PUBLIC_KEY,
 *   saveUrl: "/api/push/subscribe",
 * });
 */
export async function subscribeToPush(options: SubscribeOptions): Promise<PushSubscriptionJSON> {
  if (!isPushSupported()) {
    throw new Error("Web push is not supported in this browser.");
  }

  const registration = await navigator.serviceWorker.register(options.serviceWorkerUrl ?? "/sw.js");
  await navigator.serviceWorker.ready;

  const permission = await askPermission();
  if (permission !== "granted") {
    throw new Error(`Notification permission was "${permission}".`);
  }

  // Reuse an existing subscription if the page was already subscribed.
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidToBytes(options.vapidPublicKey) as BufferSource,
    }));

  const json = subscription.toJSON() as PushSubscriptionJSON;

  if (options.saveUrl) {
    await fetch(options.saveUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(json),
      ...options.saveInit,
    });
  }

  return json;
}

/**
 * Cancel the current push subscription (and optionally tell your backend to
 * forget it). Returns true if there was one to remove.
 */
export async function unsubscribeFromPush(options?: {
  serviceWorkerUrl?: string;
  removeUrl?: string;
  removeInit?: RequestInit;
}): Promise<boolean> {
  if (!isPushSupported()) return false;
  const registration = await navigator.serviceWorker.getRegistration(options?.serviceWorkerUrl);
  if (!registration) return false;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return false;

  if (options?.removeUrl) {
    await fetch(options.removeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
      ...options.removeInit,
    });
  }

  return subscription.unsubscribe();
}
