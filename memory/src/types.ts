/**
 * Shared types for @lacspace/memory.
 *
 * The {@link Message} shape is the same one used across the Lacspace LLM kit
 * (`@lacspace/ai`, `@lacspace/agent`, `@lacspace/prompt`), so a `Memory` window
 * drops straight into any of those chat APIs with no adapter.
 */

/** Role of a message in a conversation. */
export type Role = "system" | "user" | "assistant" | "tool";

/**
 * One message in a chat conversation. Plain-string `content` only — memory
 * management is about turns and budgets, not multimodal payloads.
 */
export interface Message {
  role: Role;
  /** The message text. */
  content: string;
  /** Optional speaker/tool name. */
  name?: string;
  /** For `role: "tool"` messages — which call this result answers. */
  toolCallId?: string;
  /** For assistant messages that requested tool calls (opaque, carried as-is). */
  toolCalls?: unknown[];
}

/**
 * Count the tokens in a piece of text. **Injectable** — pass a real tokenizer
 * (e.g. `@lacspace/tokenizer`'s `count`, or a tiktoken encoder's
 * `encode(t).length`) to make budgets exact. Defaults to a chars ÷ 4 heuristic.
 */
export type CountTokens = (text: string) => number;

/**
 * Summarize a run of old messages into a single note. **Injectable** and
 * **keyless** — you supply the function (typically wrapping `@lacspace/ai`'s
 * `chat()` with your own key), so this package never touches the network.
 * May be sync or async.
 */
export type Summarize = (
  messages: Message[],
) => Promise<string> | string;

/** Options for {@link createMemory}. */
export interface MemoryOptions {
  /** Optional system prompt, always pinned first and never dropped. */
  system?: string;
  /** Hard cap on how many messages the window may hold (excludes the system prompt). */
  maxMessages?: number;
  /** Token budget for the whole window (system prompt included in the estimate). */
  maxTokens?: number;
  /** Token counter used for every budget decision (default: chars ÷ 4). */
  countTokens?: CountTokens;
  /** Injected summarizer. When present, {@link Memory.prune} folds overflow into a summary. */
  summarize?: Summarize;
  /** Keep the system prompt when trimming/pruning (default `true`). */
  keepSystem?: boolean;
  /** Always retain at least this many of the newest messages (default `2`). */
  keepLast?: number;
}

/** A budget-aware conversation memory. */
export interface Memory {
  /** Append one message or many, in order. */
  add(message: Message | Message[]): void;
  /** Append a `user` message. */
  addUser(content: string): void;
  /** Append an `assistant` message. */
  addAssistant(content: string): void;
  /** Append a `tool` result message. */
  addTool(content: string, toolCallId?: string): void;
  /** The current window (system prompt first, if set). Safe to send to an LLM. */
  messages(): Message[];
  /** Everything ever added, in order (independent of the window). */
  history(): Message[];
  /** Forget everything (history and window); the system prompt is kept. */
  clear(): void;
  /** Number of messages in the current window (system prompt included). */
  readonly size: number;
  /** Pure, non-mutating trim of the current window to a budget. */
  toWindow(opts?: { maxTokens?: number; maxMessages?: number }): Message[];
  /**
   * Bring the window inside budget. If a `summarize` fn was injected and the
   * window is over budget, the oldest overflowing turns are replaced by a single
   * summary note; otherwise the oldest are simply dropped. Never drops the
   * system prompt or the last `keepLast` messages.
   */
  prune(): Promise<void>;
  /** Serialize to a plain JSON-safe object. */
  toJSON(): MemorySnapshot;
  /** Replace history/window from a {@link MemorySnapshot} (alias: {@link Memory.load}). */
  fromJSON(data: MemorySnapshot): void;
  /** Alias of {@link Memory.fromJSON}. */
  load(data: MemorySnapshot): void;
}

/** Plain-object serialization of a {@link Memory}. */
export interface MemorySnapshot {
  system?: string;
  /** Full history, in order. */
  history: Message[];
  /** The current window (excluding the pinned system prompt). */
  window: Message[];
}
