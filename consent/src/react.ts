"use client";
/**
 * @lacspace/consent/react — React binding.
 *
 * `useConsent()` gives you the live state + actions; `<ConsentBanner/>` renders a
 * ready banner (only until the visitor decides). Built with `createElement` (no
 * JSX). React is a peer dependency.
 */
import { createElement as h, useState, useSyncExternalStore, type ReactElement, type CSSProperties } from "react";
import { consent as defaultManager } from "./index";
import { OPTIONAL_CATEGORIES, type ConsentCategory, type ConsentManager, type ConsentState } from "./core";

export interface UseConsentResult {
  state: ConsentState;
  has: (category: ConsentCategory) => boolean;
  decided: boolean;
  acceptAll: () => void;
  rejectAll: () => void;
  set: (choice: { analytics?: boolean; marketing?: boolean; preferences?: boolean }) => void;
  reset: () => void;
}

/** Subscribe to a consent manager from React. */
export function useConsent(manager: ConsentManager = defaultManager): UseConsentResult {
  const state = useSyncExternalStore(
    (cb) => manager.subscribe(cb),
    () => manager.get(),
    () => manager.get(),
  );
  return {
    state,
    has: (category) => (category === "necessary" ? true : state[category] === true),
    decided: state.decidedAt !== null,
    acceptAll: () => manager.acceptAll(),
    rejectAll: () => manager.rejectAll(),
    set: (choice) => manager.set(choice),
    reset: () => manager.reset(),
  };
}

const LABELS: Record<Exclude<ConsentCategory, "necessary">, string> = {
  analytics: "Analytics",
  marketing: "Marketing",
  preferences: "Preferences",
};

export interface ConsentBannerProps {
  manager?: ConsentManager;
  title?: string;
  message?: string;
  policyUrl?: string;
  accent?: string;
  categories?: Exclude<ConsentCategory, "necessary">[];
}

/** A ready-to-use consent banner. Renders nothing once the visitor has decided. */
export function ConsentBanner(props: ConsentBannerProps): ReactElement | null {
  const manager = props.manager ?? defaultManager;
  const { state, decided, acceptAll, rejectAll, set } = useConsent(manager);
  const accent = props.accent ?? "#4d9fff";
  const categories = props.categories ?? (OPTIONAL_CATEGORIES.filter((c) => c !== "necessary") as Exclude<ConsentCategory, "necessary">[]);

  const [customizing, setCustomizing] = useState(false);
  const [choice, setChoice] = useState<Record<string, boolean>>(() => ({
    analytics: state.analytics,
    marketing: state.marketing,
    preferences: state.preferences,
  }));

  if (decided) return null;

  const btn = (label: string, onClick: () => void, primary = false): ReactElement =>
    h(
      "button",
      {
        key: label,
        onClick,
        style: {
          cursor: "pointer",
          borderRadius: 8,
          padding: "8px 14px",
          font: "inherit",
          fontWeight: 500,
          border: primary ? "none" : "1px solid rgba(128,128,128,0.4)",
          background: primary ? accent : "transparent",
          color: primary ? "#0b0b0f" : "#f4f4f5",
        } as CSSProperties,
      },
      label,
    );

  return h(
    "div",
    {
      role: "dialog",
      "aria-label": "Cookie consent",
      style: {
        position: "fixed",
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 2147483647,
        margin: "0 auto",
        maxWidth: 560,
        background: "#111114",
        color: "#f4f4f5",
        border: "1px solid rgba(128,128,128,0.35)",
        borderRadius: 14,
        padding: "18px 20px",
        boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
        font: "14px/1.5 system-ui, -apple-system, sans-serif",
      } as CSSProperties,
    },
    h("div", { style: { fontWeight: 600, marginBottom: 6 } }, props.title ?? "We value your privacy"),
    h(
      "div",
      { style: { opacity: 0.85 } },
      props.message ?? "We use cookies to run the site and, with your consent, to measure and improve it.",
      props.policyUrl ? h("a", { href: props.policyUrl, style: { color: accent } }, " Learn more.") : null,
    ),
    customizing
      ? h(
          "div",
          { style: { margin: "12px 0" } },
          categories.map((category) =>
            h(
              "label",
              { key: category, style: { display: "flex", alignItems: "center", gap: 8, padding: "4px 0" } as CSSProperties },
              h("input", {
                type: "checkbox",
                checked: choice[category] ?? false,
                onChange: (e: { target: { checked: boolean } }) =>
                  setChoice((prev) => ({ ...prev, [category]: e.target.checked })),
              }),
              h("span", null, LABELS[category]),
            ),
          ),
        )
      : null,
    h(
      "div",
      { style: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 } as CSSProperties },
      btn("Accept all", acceptAll, true),
      btn("Reject non-essential", rejectAll),
      customizing
        ? btn("Save choices", () => set(choice))
        : btn("Customize", () => setCustomizing(true)),
    ),
  );
}
