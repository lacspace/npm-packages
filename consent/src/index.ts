/**
 * @lacspace/consent — GDPR-friendly cookie consent, zero dependencies.
 *
 * Two ways to use it:
 *   1. Vanilla / any framework: `import { consent, mountConsentBanner }` — mount
 *      the banner once; gate scripts with `whenConsent(consent, "analytics", ...)`.
 *   2. React: `import { ConsentBanner, useConsent } from "@lacspace/consent/react"`.
 *
 * The store is framework-agnostic (see ./core) and mirrors the decision to a
 * cookie, so your server can gate too via `parseConsentCookie`.
 */

export * from "./core";
import { createConsent, OPTIONAL_CATEGORIES, type ConsentCategory, type ConsentManager } from "./core";

/** The default shared consent manager. */
export const consent = createConsent();

const CATEGORY_LABELS: Record<Exclude<ConsentCategory, "necessary">, string> = {
  analytics: "Analytics",
  marketing: "Marketing",
  preferences: "Preferences",
};

export interface ConsentBannerOptions {
  manager?: ConsentManager;
  title?: string;
  message?: string;
  policyUrl?: string;
  accent?: string;
  /** Which optional categories to show toggles for. Default all three. */
  categories?: Exclude<ConsentCategory, "necessary">[];
}

/**
 * Mount the consent banner into the DOM if the visitor hasn't decided yet. Call
 * once (e.g. in your root layout). Returns an `unmount()` function. No-op on the
 * server or once a choice has been made.
 */
export function mountConsentBanner(options: ConsentBannerOptions = {}): () => void {
  if (typeof document === "undefined") return () => {};
  const manager = options.manager ?? consent;
  if (manager.decided()) return () => {};

  const accent = options.accent ?? "#4d9fff";
  const categories = options.categories ?? (OPTIONAL_CATEGORIES.filter((c) => c !== "necessary") as Exclude<ConsentCategory, "necessary">[]);

  const root = document.createElement("div");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Cookie consent");
  Object.assign(root.style, {
    position: "fixed",
    left: "16px",
    right: "16px",
    bottom: "16px",
    zIndex: "2147483647",
    margin: "0 auto",
    maxWidth: "560px",
    background: "#111114",
    color: "#f4f4f5",
    border: "1px solid rgba(128,128,128,0.35)",
    borderRadius: "14px",
    padding: "18px 20px",
    boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
    font: "14px/1.5 system-ui, -apple-system, sans-serif",
  } as Partial<CSSStyleDeclaration>);

  const title = document.createElement("div");
  title.textContent = options.title ?? "We value your privacy";
  title.style.fontWeight = "600";
  title.style.marginBottom = "6px";

  const message = document.createElement("div");
  message.style.opacity = "0.85";
  message.textContent =
    options.message ?? "We use cookies to run the site and, with your consent, to measure and improve it.";
  if (options.policyUrl) {
    const link = document.createElement("a");
    link.href = options.policyUrl;
    link.textContent = " Learn more.";
    link.style.color = accent;
    message.appendChild(link);
  }

  // Optional per-category toggles (revealed by "Customize").
  const details = document.createElement("div");
  details.hidden = true;
  details.style.margin = "12px 0";
  const toggles = new Map<Exclude<ConsentCategory, "necessary">, HTMLInputElement>();
  for (const category of categories) {
    const row = document.createElement("label");
    Object.assign(row.style, { display: "flex", alignItems: "center", gap: "8px", padding: "4px 0" } as Partial<CSSStyleDeclaration>);
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = manager.has(category);
    toggles.set(category, input);
    const span = document.createElement("span");
    span.textContent = CATEGORY_LABELS[category];
    row.append(input, span);
    details.appendChild(row);
  }

  const actions = document.createElement("div");
  Object.assign(actions.style, { display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "14px" } as Partial<CSSStyleDeclaration>);

  const button = (label: string, primary: boolean): HTMLButtonElement => {
    const b = document.createElement("button");
    b.textContent = label;
    Object.assign(b.style, {
      cursor: "pointer",
      borderRadius: "8px",
      padding: "8px 14px",
      font: "inherit",
      fontWeight: "500",
      border: primary ? "none" : "1px solid rgba(128,128,128,0.4)",
      background: primary ? accent : "transparent",
      color: primary ? "#0b0b0f" : "#f4f4f5",
    } as Partial<CSSStyleDeclaration>);
    return b;
  };

  let unmount = () => {
    root.remove();
  };

  const acceptAll = button("Accept all", true);
  acceptAll.addEventListener("click", () => {
    manager.acceptAll();
    unmount();
  });

  const rejectAll = button("Reject non-essential", false);
  rejectAll.addEventListener("click", () => {
    manager.rejectAll();
    unmount();
  });

  const customize = button("Customize", false);
  const saveChoices = button("Save choices", false);
  saveChoices.hidden = true;
  customize.addEventListener("click", () => {
    details.hidden = false;
    customize.hidden = true;
    saveChoices.hidden = false;
  });
  saveChoices.addEventListener("click", () => {
    const choice: Record<string, boolean> = {};
    for (const [category, input] of toggles) choice[category] = input.checked;
    manager.set(choice);
    unmount();
  });

  actions.append(acceptAll, rejectAll, customize, saveChoices);
  root.append(title, message, details, actions);
  document.body.appendChild(root);

  return () => unmount();
}
