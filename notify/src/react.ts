"use client";
/**
 * @lacspace/notify/react — React binding.
 *
 * `<Toaster />` renders the toasts; `useToast()` gives you the live list plus the
 * notifier api. Built with `createElement` (no JSX) so it stays a plain, zero-JSX
 * dependency. React is a peer dependency.
 */
import { createElement as h, useSyncExternalStore, Fragment, type ReactElement, type CSSProperties } from "react";
import { toast as defaultNotifier } from "./index";
import type { Toast, ToastType, Notifier } from "./core";

/** Subscribe to a notifier from React. Returns `{ toasts, toast }`. */
export function useToast(notifier: Notifier = defaultNotifier): { toasts: Toast[]; toast: Notifier } {
  const toasts = useSyncExternalStore(
    (cb) => notifier.subscribe(cb),
    () => notifier.getToasts(),
    () => notifier.getToasts(),
  );
  return { toasts, toast: notifier };
}

export type ToastPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

const ACCENT: Record<ToastType, string> = {
  success: "#16a34a",
  error: "#dc2626",
  warning: "#d97706",
  info: "#2563eb",
  loading: "#6b7280",
  default: "#4d9fff",
};
const ICON: Record<ToastType, string> = {
  success: "✓",
  error: "✕",
  warning: "!",
  info: "i",
  loading: "◌",
  default: "•",
};

function containerStyle(position: ToastPosition): CSSProperties {
  const [v, hz] = position.split("-");
  const style: CSSProperties = {
    position: "fixed",
    zIndex: 2147483647,
    display: "flex",
    flexDirection: v === "top" ? "column" : "column-reverse",
    gap: 8,
    padding: 16,
    pointerEvents: "none",
    maxWidth: "min(92vw, 380px)",
  };
  if (v === "top") style.top = 0;
  else style.bottom = 0;
  if (hz === "center") {
    style.left = "50%";
    style.transform = "translateX(-50%)";
  } else if (hz === "left") {
    style.left = 0;
  } else {
    style.right = 0;
  }
  return style;
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }): ReactElement {
  const accent = ACCENT[toast.type];
  return h(
    "div",
    {
      role: toast.type === "error" ? "alert" : "status",
      "aria-live": toast.type === "error" ? "assertive" : "polite",
      style: {
        pointerEvents: "auto",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        background: "#111114",
        color: "#f4f4f5",
        borderInlineStart: `3px solid ${accent}`,
        borderRadius: 10,
        padding: "12px 14px",
        boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
        font: "14px/1.45 system-ui, -apple-system, sans-serif",
        animation: "lac-notify-in 160ms ease-out",
      } as CSSProperties,
    },
    h(
      "span",
      {
        style: {
          flex: "0 0 auto",
          width: 20,
          height: 20,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          fontSize: 12,
          color: "#fff",
          background: accent,
          animation: toast.type === "loading" ? "lac-notify-spin 800ms linear infinite" : undefined,
        } as CSSProperties,
      },
      ICON[toast.type],
    ),
    h(
      "div",
      { style: { flex: "1 1 auto", minWidth: 0 } },
      toast.title ? h("div", { style: { fontWeight: 600, marginBottom: 2 } }, toast.title) : null,
      h("div", { style: { opacity: 0.92 } }, toast.message),
      toast.action
        ? h(
            "button",
            {
              onClick: () => toast.action?.onClick(),
              style: {
                marginTop: 8,
                background: "transparent",
                color: accent,
                border: `1px solid ${accent}`,
                borderRadius: 6,
                padding: "4px 10px",
                cursor: "pointer",
                font: "inherit",
              } as CSSProperties,
            },
            toast.action.label,
          )
        : null,
    ),
    h(
      "button",
      {
        "aria-label": "Dismiss",
        onClick: () => onDismiss(toast.id),
        style: {
          flex: "0 0 auto",
          background: "transparent",
          border: "none",
          color: "#f4f4f5",
          opacity: 0.5,
          cursor: "pointer",
          fontSize: 18,
          lineHeight: 1,
          padding: 0,
        } as CSSProperties,
      },
      "×",
    ),
  );
}

export interface ToasterProps {
  position?: ToastPosition;
  notifier?: Notifier;
  className?: string;
}

const KEYFRAMES =
  "@keyframes lac-notify-in{from{opacity:0;transform:translateY(-8px) scale(0.98)}to{opacity:1;transform:none}}" +
  "@keyframes lac-notify-spin{to{transform:rotate(360deg)}}";

/** Drop this once near your app root. Renders the toast stack. */
export function Toaster(props: ToasterProps): ReactElement {
  const { toasts, toast } = useToast(props.notifier);
  return h(
    Fragment,
    null,
    h("style", null, KEYFRAMES),
    h(
      "div",
      { className: props.className, style: containerStyle(props.position ?? "top-right") },
      toasts.map((t) => h(ToastCard, { key: t.id, toast: t, onDismiss: toast.dismiss })),
    ),
  );
}

export { toast } from "./index";
