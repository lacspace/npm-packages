/**
 * The agent loop: call chat → if the model requested tool calls, dispatch them
 * to the handlers, append the results, and repeat — until the model returns a
 * final text answer or the `maxSteps` guard trips.
 */
import type {
  Agent,
  AgentOptions,
  AgentRun,
  AgentStep,
  ChatResult,
  Message,
  RunOptions,
  ToolCall,
} from "./types";
import { dispatchTool, stringifyResult, toolMap } from "./tool";

const DEFAULT_MAX_STEPS = 8;

/** Normalize the `run` input into a message list. */
function toMessages(input: string | Message[]): Message[] {
  if (typeof input === "string") {
    return [{ role: "user", content: input }];
  }
  return input.map((m) => ({ ...m }));
}

/** Throw a DOMException-like abort error, matching `fetch`/`AbortSignal`. */
function abortError(): Error {
  const err = new Error("The operation was aborted.");
  err.name = "AbortError";
  return err;
}

/**
 * Create a reusable agent bound to a chat function, tools and defaults.
 *
 * The returned agent's `run` drives the full tool-calling loop and returns an
 * {@link AgentRun} with the final `output`, a complete `steps` trace, the
 * accumulated `messages`, every `toolCalls`, and a `finishReason`.
 */
export function createAgent(opts: AgentOptions): Agent {
  if (typeof opts?.chat !== "function") {
    throw new Error("createAgent: `chat` function is required.");
  }
  const tools = opts.tools ?? [];
  const tools_ = toolMap(tools);
  const baseMaxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;

  async function run(
    input: string | Message[],
    runOpts: RunOptions = {},
  ): Promise<AgentRun> {
    const messages = toMessages(input);

    // Prepend the system prompt only when the caller didn't provide one.
    if (opts.systemPrompt && !messages.some((m) => m.role === "system")) {
      messages.unshift({ role: "system", content: opts.systemPrompt });
    }

    const steps: AgentStep[] = [];
    const allToolCalls: ToolCall[] = [];
    const signal = runOpts.signal;
    const maxSteps = Math.max(1, runOpts.maxSteps ?? baseMaxSteps);

    const emit = (step: AgentStep) => {
      steps.push(step);
      opts.onStep?.(step);
    };

    let output = "";
    let finishReason: AgentRun["finishReason"] = "max_steps";

    for (let step = 0; step < maxSteps; step++) {
      if (signal?.aborted) {
        finishReason = "error";
        return { output, steps, messages, toolCalls: allToolCalls, finishReason };
      }

      let res: ChatResult;
      try {
        res = await opts.chat(messages, { tools, signal });
      } catch (err) {
        if (signal?.aborted || (err as Error)?.name === "AbortError") {
          finishReason = "error";
          return { output, steps, messages, toolCalls: allToolCalls, finishReason };
        }
        throw err;
      }

      const content = res.content ?? "";
      const calls = res.toolCalls ?? [];

      // Record the assistant turn.
      const assistant: Message = { role: "assistant", content };
      if (calls.length) assistant.toolCalls = calls;
      messages.push(assistant);
      emit({
        type: "message",
        role: "assistant",
        content,
        ...(calls.length ? { toolCalls: calls } : {}),
      });

      // No tool calls → this is the final answer.
      if (calls.length === 0) {
        output = content;
        finishReason = "stop";
        return { output, steps, messages, toolCalls: allToolCalls, finishReason };
      }

      // Dispatch every requested tool call, appending a tool result message.
      for (const call of calls) {
        allToolCalls.push(call);
        emit({ type: "tool_call", toolCall: call });

        const { result, error } = await dispatchTool(call, tools_);
        messages.push({
          role: "tool",
          content: stringifyResult(result),
          toolCallId: call.id,
          name: call.name,
        });
        emit({
          type: "tool_result",
          toolCallId: call.id,
          name: call.name,
          result,
          ...(error ? { error } : {}),
        });
      }
      // Loop again so the model can react to the tool results.
    }

    // Ran out of steps — surface the last assistant text as the best-effort output.
    finishReason = "max_steps";
    return { output, steps, messages, toolCalls: allToolCalls, finishReason };
  }

  return { run };
}

/**
 * One-shot convenience: build an agent and run it in a single call. Pass the
 * agent options plus the `input` (and an optional per-run `signal`).
 *
 * ```ts
 * const run = await runAgent({ chat, tools, input: "What's 2+2?" });
 * console.log(run.output);
 * ```
 */
export function runAgent(
  opts: AgentOptions & { input: string | Message[]; signal?: AbortSignal },
): Promise<AgentRun> {
  const { input, signal, ...agentOpts } = opts;
  return createAgent(agentOpts).run(input, { signal });
}

export { abortError };
