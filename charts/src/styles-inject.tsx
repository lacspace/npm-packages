import { useEffect } from "react";
import { CSS } from "./css.generated.js";

/** The chart stylesheet as a string, for bundlers that cannot import CSS. */
export { CSS as chartsCss } from "./css.generated.js";

const STYLE_ID = "lacspace-charts-styles";

/**
 * Inject the stylesheet at runtime.
 *
 * Prefer `import "@lacspace/charts/styles.css"` when your setup can do it —
 * that ships the CSS in the normal pipeline. Use this component when it cannot:
 * a CDN page, a sandbox, or an app where you only render one widget.
 * Injecting twice is harmless; the id guard makes it a no-op.
 */
export function LacspaceChartStyles(): null {
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
