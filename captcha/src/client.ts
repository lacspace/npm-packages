/**
 * @lacspace/captcha/client — the drop-in browser widget.
 *
 * Renders a small "I'm human" box, fetches a challenge from your endpoint, solves
 * it in the background (yielding so the page stays responsive), and writes the
 * encoded solution into a hidden `<input>` so a surrounding `<form>` just submits
 * it. Zero dependencies. Verify the field on your server with `verifySolution`.
 */

import { solveChallenge, encodeSolution, type Challenge } from "./index";

export interface CaptchaWidgetOptions {
  /** URL that returns a Challenge JSON (GET), or a function that resolves one. */
  challenge: string | (() => Promise<Challenge>);
  /** Name of the hidden input added for form submission. Default "lacspace-captcha". */
  fieldName?: string;
  /** Start solving immediately instead of waiting for a click. Default false. */
  auto?: boolean;
  /** Label text. Default "I'm a human". */
  label?: string;
  /** Extra fetch init when `challenge` is a URL. */
  fetchInit?: RequestInit;
  onVerified?: (encodedSolution: string) => void;
  onError?: (error: Error) => void;
}

export interface CaptchaWidget {
  element: HTMLElement;
  /** The encoded solution once verified, else null. */
  getSolution(): string | null;
  /** Kick off fetch + solve (also triggered by clicking the widget). */
  start(): Promise<void>;
  /** Return to the idle state and clear the solution. */
  reset(): void;
  destroy(): void;
}

type State = "idle" | "working" | "verified" | "error";

const ACCENT = "#4d9fff";

export function renderCaptcha(container: HTMLElement, options: CaptchaWidgetOptions): CaptchaWidget {
  const fieldName = options.fieldName ?? "lacspace-captcha";
  let state: State = "idle";
  let solution: string | null = null;

  const root = document.createElement("div");
  Object.assign(root.style, {
    display: "inline-flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 14px",
    border: "1px solid rgba(128,128,128,0.35)",
    borderRadius: "10px",
    font: "14px/1.2 system-ui, -apple-system, sans-serif",
    cursor: "pointer",
    userSelect: "none",
    minWidth: "220px",
  } as Partial<CSSStyleDeclaration>);

  const box = document.createElement("span");
  Object.assign(box.style, {
    width: "20px",
    height: "20px",
    borderRadius: "5px",
    border: `2px solid ${ACCENT}`,
    display: "grid",
    placeItems: "center",
    flex: "0 0 auto",
    fontSize: "13px",
    color: "#fff",
  } as Partial<CSSStyleDeclaration>);

  const text = document.createElement("span");
  const hidden = document.createElement("input");
  hidden.type = "hidden";
  hidden.name = fieldName;

  root.append(box, text, hidden);
  container.appendChild(root);

  function render() {
    if (state === "idle") {
      box.textContent = "";
      box.style.background = "transparent";
      text.textContent = options.label ?? "I'm a human";
      root.style.borderColor = "rgba(128,128,128,0.35)";
    } else if (state === "working") {
      box.textContent = "◌";
      box.style.background = "transparent";
      box.style.animation = "lac-captcha-spin 800ms linear infinite";
      text.textContent = "Verifying…";
    } else if (state === "verified") {
      box.style.animation = "";
      box.textContent = "✓";
      box.style.background = ACCENT;
      text.textContent = "Verified";
      root.style.borderColor = ACCENT;
      root.style.cursor = "default";
    } else {
      box.style.animation = "";
      box.textContent = "!";
      box.style.background = "#dc2626";
      box.style.borderColor = "#dc2626";
      text.textContent = "Try again";
      root.style.borderColor = "#dc2626";
    }
  }

  let keyframesInjected = false;
  function injectKeyframes() {
    if (keyframesInjected || typeof document === "undefined") return;
    const style = document.createElement("style");
    style.textContent = "@keyframes lac-captcha-spin{to{transform:rotate(360deg)}}";
    document.head.appendChild(style);
    keyframesInjected = true;
  }

  async function fetchChallenge(): Promise<Challenge> {
    if (typeof options.challenge === "function") return options.challenge();
    const res = await fetch(options.challenge, options.fetchInit);
    if (!res.ok) throw new Error(`Failed to fetch challenge: ${res.status}`);
    return res.json();
  }

  async function start(): Promise<void> {
    if (state === "working" || state === "verified") return;
    injectKeyframes();
    state = "working";
    render();
    try {
      const challenge = await fetchChallenge();
      const result = await solveChallenge(challenge, { chunkSize: 5000 });
      if (!result) throw new Error("Could not solve challenge");
      solution = encodeSolution(result);
      hidden.value = solution;
      state = "verified";
      render();
      options.onVerified?.(solution);
    } catch (err) {
      state = "error";
      render();
      options.onError?.(err as Error);
    }
  }

  function reset(): void {
    state = "idle";
    solution = null;
    hidden.value = "";
    root.style.cursor = "pointer";
    render();
  }

  const onClick = () => {
    if (state === "idle" || state === "error") void start();
  };
  root.addEventListener("click", onClick);

  render();
  if (options.auto) void start();

  return {
    element: root,
    getSolution: () => solution,
    start,
    reset,
    destroy: () => {
      root.removeEventListener("click", onClick);
      root.remove();
    },
  };
}
