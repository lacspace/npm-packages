/**
 * Shared types for @lacspace/agent — a tiny, keyless tool-calling / ReAct
 * agent loop.
 *
 * The LLM and the tools are **duck-typed, injectable interfaces**: the shapes
 * below intentionally match `@lacspace/ai` (its `chat`) and `@lacspace/ai-tools`
 * (its `ToolCall` / definable tool), so the two snap together with no hard
 * dependency and the whole loop is testable with a fake model.
 */

/** Role of a message in a conversation. */
export type Role = "system" | "user" | "assistant" | "tool";

/**
 * A tool/function call requested by the model.
 * `arguments` is the parsed JSON arguments object (matches
 * `@lacspace/ai-tools`' `ToolCall`).
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** One message in a chat conversation. */
export interface Message {
  role: Role;
  content: string;
  /** For assistant messages that requested tool calls. */
  toolCalls?: ToolCall[];
  /** For `role: "tool"` messages — which call this result answers. */
  toolCallId?: string;
  /** Optional name (tool name for tool results, or speaker name). */
  name?: string;
}

/** The normalized result of a single chat turn. */
export interface ChatResult {
  content: string;
  toolCalls?: ToolCall[];
}

/**
 * The injectable chat function. Duck-typed to match `@lacspace/ai`'s `chat`:
 * give it the running conversation (and, optionally, the available tools) and
 * it returns the assistant's next turn — either final text or tool calls.
 *
 * Any network/model access lives entirely inside *your* implementation, so the
 * agent itself is keyless and never touches the network.
 */
export type ChatFn = (
  messages: Message[],
  opts?: { tools?: AgentTool[]; signal?: AbortSignal },
) => Promise<ChatResult>;

/**
 * A tool the agent can dispatch to. Matches `@lacspace/ai-tools`' definable
 * tool: a name, an optional description + parameters schema (passed through to
 * the model), and a `handler` that runs the call.
 */
export interface AgentTool {
  name: string;
  description?: string;
  /** JSON Schema (or any schema object) describing the arguments. */
  parameters?: unknown;
  handler: (
    args: Record<string, unknown>,
  ) => Promise<unknown> | unknown;
}

/** Why the agent loop stopped. */
export type FinishReason = "stop" | "max_steps" | "error";

/** A single entry in the agent's execution trace. */
export type AgentStep =
  | { type: "message"; role: Role; content: string; toolCalls?: ToolCall[] }
  | { type: "tool_call"; toolCall: ToolCall }
  | {
      type: "tool_result";
      toolCallId: string;
      name: string;
      result: unknown;
      /** Present when the handler threw and was recovered. */
      error?: string;
    };

/** The full result of running the agent. */
export interface AgentRun {
  /** The final assistant text answer. */
  output: string;
  /** The complete, ordered trace for observability. */
  steps: AgentStep[];
  /** The full message list (input + everything the loop appended). */
  messages: Message[];
  /** Every tool call the model made, in order. */
  toolCalls: ToolCall[];
  finishReason: FinishReason;
}

/** Options for {@link createAgent}. */
export interface AgentOptions {
  /** The injectable chat function (e.g. `@lacspace/ai`'s `chat`). */
  chat: ChatFn;
  /** Tools the model may call. */
  tools?: AgentTool[];
  /** Prepended as a `system` message when the input has none. */
  systemPrompt?: string;
  /** Hard cap on loop iterations (chat turns). Default `8`. */
  maxSteps?: number;
  /** Called after every trace step — for logging / streaming UIs. */
  onStep?: (step: AgentStep) => void;
}

/** Per-run overrides. */
export interface RunOptions {
  /** Override the agent's `maxSteps` for this run. */
  maxSteps?: number;
  /** Abort signal forwarded to `chat` and checked between steps. */
  signal?: AbortSignal;
}

/** A configured agent. */
export interface Agent {
  run(input: string | Message[], opts?: RunOptions): Promise<AgentRun>;
}
