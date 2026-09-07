/**
 * Preheader (inbox preview text) block.
 *
 * `render()` already injects `opts.preheader`; this exported helper lets you
 * drop a hidden preview-text slot into a hand-composed block list. It also
 * appends invisible zero-width padding so email clients don't pull body copy
 * into the preview line after your text.
 */

import { escapeHtml } from "./index";

/** Hidden preview text for a compose-your-own block list. */
export function preheader(text: string): string {
  // Trailing zero-width non-joiners + non-breaking spaces "use up" the preview
  // line so leaked body copy doesn't follow the intended preheader.
  const pad = "‌ ".repeat(60);
  return (
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(text)}</div>` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${pad}</div>`
  );
}
