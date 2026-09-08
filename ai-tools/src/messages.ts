/**
 * `toToolMessages` — turn the {@link DispatchResult}(s) from
 * {@link Toolbox.dispatch}/`dispatchAll` back into the provider-shaped
 * message(s) you append to the conversation before the next model turn.
 *
 * Pure and deterministic — no network. Always returns an ARRAY of messages to
 * append, so the call site is uniform across providers:
 *
 * ```ts
 * const calls = parseToolCalls(response);
 * const results = await kit.dispatchAll(calls);
 * messages.push(...toToolMessages("openai", results));
 * ```
 *
 * Shapes produced:
 *  - openai:     one `{ role: "tool", tool_call_id, content }` per result
 *  - anthropic:  one `{ role: "user", content: [ { type: "tool_result", ... } ] }`
 *  - google:     one `{ role: "user", parts: [ { functionResponse: { ... } } ] }`
 *
 * A failed result (`isError`) is surfaced as its error text, and for Anthropic
 * as `is_error: true` on the `tool_result` block.
 */
import type { Provider } from "./spec";
import type { DispatchResult } from "./toolbox";

function toText(r: DispatchResult): string {
  if (r.isError) return r.error ?? "Error";
  const v = r.result;
  return typeof v === "string" ? v : JSON.stringify(v ?? null);
}

function toResponseObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return { result: v };
}

/**
 * Format one or more dispatch results into provider messages ready to append
 * to the conversation. Returns an array (possibly of length 1) in every case.
 */
export function toToolMessages(
  provider: Provider,
  results: DispatchResult | DispatchResult[],
): unknown[] {
  const list = Array.isArray(results) ? results : [results];
  switch (provider) {
    case "openai":
      return list.map((r) => ({
        role: "tool",
        tool_call_id: r.id,
        content: toText(r),
      }));
    case "anthropic":
      return [
        {
          role: "user",
          content: list.map((r) => {
            const block: Record<string, unknown> = {
              type: "tool_result",
              tool_use_id: r.id,
              content: toText(r),
            };
            if (r.isError) block.is_error = true;
            return block;
          }),
        },
      ];
    case "google":
      return [
        {
          role: "user",
          parts: list.map((r) => ({
            functionResponse: {
              name: r.name,
              response: r.isError
                ? { error: r.error ?? "Error" }
                : toResponseObject(r.result),
            },
          })),
        },
      ];
    default:
      throw new Error(
        `Unknown provider "${provider}". Use "openai", "anthropic" or "google".`,
      );
  }
}
