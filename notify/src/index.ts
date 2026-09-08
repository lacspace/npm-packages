/**
 * @lacspace/notify — beautiful in-app toast notifications, zero dependencies.
 *
 * Two ways to use it:
 *   1. Vanilla / any framework: `import { toast, mount } from "@lacspace/notify"`,
 *      call `mount()` once, then `toast.success("Saved!")` anywhere.
 *   2. React: `import { Toaster, useToast } from "@lacspace/notify/react"`.
 *
 * The store is framework-agnostic (see ./core); this entry adds the default
 * singleton and a tiny DOM renderer.
 */

export * from "./core";
import { createNotifier, type Toast, type ToastType, type NotifierOptions } from "./core";

/** The default shared notifier. `toast.success(...)`, `toast.error(...)`, etc. */
export const toast = createNotifier();

// ---------------------------------------------------------------------------
// Vanilla DOM renderer
// ---------------------------------------------------------------------------

export type ToastPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface MountOptions {
  /** Where to stack toasts. Default "top-right". */
  position?: ToastPosition;
  /** Which notifier to render. Default the shared `toast`. */
  notifier?: ReturnType<typeof createNotifier>;
  /** Container to render into. Default a new fixed-position layer on <body>. */
  target?: HTMLElement;
}

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

function positionStyles(position: ToastPosition): Partial<CSSStyleDeclaration> {
  const [v, h] = position.split("-");
  const styles: Partial<CSSStyleDeclaration> = {
    position: "fixed",
    zIndex: "2147483647",
    display: "flex",
    flexDirection: v === "top" ? "column" : "column-reverse",
    gap: "8px",
    padding: "16px",
    pointerEvents: "none",
    maxWidth: "min(92vw, 380px)",
  };
  styles[v as "top" | "bottom"] = "0";
  if (h === "center") {
    styles.left = "50%";
    styles.transform = "translateX(-50%)";
  } else {
    styles[h as "left" | "right"] = "0";
  }
  return styles;
}

function renderToastEl(t: Toast, onDismiss: (id: string) => void): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("role", t.type === "error" ? "alert" : "status");
  el.setAttribute("aria-live", t.type === "error" ? "assertive" : "polite");
  Object.assign(el.style, {
    pointerEvents: "auto",
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    background: "#111114",
    color: "#f4f4f5",
    borderInlineStart: `3px solid ${ACCENT[t.type]}`,
    borderRadius: "10px",
    padding: "12px 14px",
    boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
    font: "14px/1.45 system-ui, -apple-system, sans-serif",
    animation: "lac-notify-in 160ms ease-out",
  } as Partial<CSSStyleDeclaration>);

  const badge = document.createElement("span");
  badge.textContent = ICON[t.type];
  Object.assign(badge.style, {
    flex: "0 0 auto",
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    fontSize: "12px",
    color: "#fff",
    background: ACCENT[t.type],
  } as Partial<CSSStyleDeclaration>);
  if (t.type === "loading") badge.style.animation = "lac-notify-spin 800ms linear infinite";

  const body = document.createElement("div");
  body.style.flex = "1 1 auto";
  body.style.minWidth = "0";
  if (t.title) {
    const title = document.createElement("div");
    title.textContent = t.title;
    title.style.fontWeight = "600";
    title.style.marginBottom = "2px";
    body.appendChild(title);
  }
  const msg = document.createElement("div");
  msg.textContent = t.message;
  msg.style.opacity = "0.92";
  body.appendChild(msg);

  if (t.action) {
    const action = document.createElement("button");
    action.textContent = t.action.label;
    Object.assign(action.style, {
      marginTop: "8px",
      background: "transparent",
      color: ACCENT[t.type],
      border: `1px solid ${ACCENT[t.type]}`,
      borderRadius: "6px",
      padding: "4px 10px",
      cursor: "pointer",
      font: "inherit",
    } as Partial<CSSStyleDeclaration>);
    action.addEventListener("click", () => t.action?.onClick());
    body.appendChild(action);
  }

  const close = document.createElement("button");
  close.setAttribute("aria-label", "Dismiss");
  close.textContent = "×";
  Object.assign(close.style, {
    flex: "0 0 auto",
    background: "transparent",
    border: "none",
    color: "#f4f4f5",
    opacity: "0.5",
    cursor: "pointer",
    fontSize: "18px",
    lineHeight: "1",
    padding: "0",
  } as Partial<CSSStyleDeclaration>);
  close.addEventListener("click", () => onDismiss(t.id));

  el.append(badge, body, close);
  return el;
}

let stylesInjected = false;
function injectKeyframes() {
  if (stylesInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.textContent =
    "@keyframes lac-notify-in{from{opacity:0;transform:translateY(-8px) scale(0.98)}to{opacity:1;transform:none}}" +
    "@keyframes lac-notify-spin{to{transform:rotate(360deg)}}";
  document.head.appendChild(style);
  stylesInjected = true;
}

/**
 * Mount the toast layer into the DOM. Call once (e.g. in your root layout).
 * Returns an `unmount()` function. No-op on the server.
 *
 * @example
 * import { mount, toast } from "@lacspace/notify";
 * mount({ position: "bottom-right" });
 * toast.success("Saved!");
 */
export function mount(options: MountOptions = {}): () => void {
  if (typeof document === "undefined") return () => {};
  injectKeyframes();

  const notifier = options.notifier ?? toast;
  const container = options.target ?? document.createElement("div");
  if (!options.target) {
    Object.assign(container.style, positionStyles(options.position ?? "top-right"));
    document.body.appendChild(container);
  }

  const render = (toasts: Toast[]) => {
    container.textContent = "";
    for (const t of toasts) container.appendChild(renderToastEl(t, notifier.dismiss));
  };

  render(notifier.getToasts());
  const unsubscribe = notifier.subscribe(render);

  return () => {
    unsubscribe();
    if (!options.target) container.remove();
  };
}

export type { NotifierOptions };
