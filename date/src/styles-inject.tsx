import { useEffect } from "react";
import { CSS } from "./css.generated.js";

/** The stylesheet as a string, for bundlers that cannot import CSS. */
export { CSS as dateCss } from "./css.generated.js";

const STYLE_ID = "lacspace-date-styles";

/**
 * Inject the stylesheet at runtime.
 *
 * Prefer `import "@lacspace/date/styles.css"` when your setup can do it — that
 * ships the CSS through the normal pipeline. Use this when it cannot: a CDN
 * page, a sandbox, or an app where you only render a widget. Injecting twice
 * is harmless; the id guard makes it a no-op.
 */
export function DateStyles(): null {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);
  return null;
}
