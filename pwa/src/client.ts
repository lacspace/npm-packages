/**
 * @lacspace/pwa/client — the browser helpers.
 *
 * Registers your generated service worker and drives the "Add to Home Screen"
 * install prompt. Zero dependencies; standard `navigator` / `window` APIs.
 */

/** The `beforeinstallprompt` event isn't in every TS lib — model the bit we use. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

/** True if service workers are usable here (https or localhost, SW supported). */
export function isServiceWorkerSupported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

/** True if the app is running installed (standalone display mode). */
export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches;
  // iOS Safari exposes navigator.standalone instead.
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return Boolean(standalone || iosStandalone);
}

/** Register the service worker. Resolves to the registration (or undefined). */
export async function registerServiceWorker(
  url = "/sw.js",
  options?: RegistrationOptions,
): Promise<ServiceWorkerRegistration | undefined> {
  if (!isServiceWorkerSupported()) return undefined;
  const registration = await navigator.serviceWorker.register(url, options);
  return registration;
}

/** Unregister all service workers (useful in dev / when disabling the PWA). */
export async function unregisterServiceWorkers(): Promise<boolean> {
  if (!isServiceWorkerSupported()) return false;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((r) => r.unregister()));
  return registrations.length > 0;
}

/**
 * Start listening for the browser's install prompt. Browsers only fire it when
 * the PWA is installable, so call this early (e.g. on app mount). The callback
 * runs with `true` once an install is available, and you can then call
 * {@link promptInstall}. Returns a cleanup function.
 *
 * @example
 * useEffect(() => watchInstallAvailability(setCanInstall), []);
 */
export function watchInstallAvailability(onChange: (available: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onBeforeInstall = (event: Event) => {
    event.preventDefault(); // stop Chrome's mini-infobar; we'll prompt ourselves
    deferredPrompt = event as BeforeInstallPromptEvent;
    onChange(true);
  };
  const onInstalled = () => {
    deferredPrompt = null;
    onChange(false);
  };
  window.addEventListener("beforeinstallprompt", onBeforeInstall);
  window.addEventListener("appinstalled", onInstalled);
  return () => {
    window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

/** True if an install prompt is currently available to show. */
export function canInstall(): boolean {
  return deferredPrompt !== null;
}

/**
 * Show the native install prompt (must be called from a user gesture, e.g. a
 * button click). Returns the outcome, or "unavailable" if there's nothing to show.
 */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferredPrompt) return "unavailable";
  const prompt = deferredPrompt;
  deferredPrompt = null;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  return outcome;
}
