/**
 * Provider-neutral chat message builder.
 *
 * `messages().system(...).user(...).assistant(...).build()` returns a plain
 * `{ role, content }[]` that maps onto any LLM chat API (Anthropic, OpenAI,
 * Gemini, local models, …).
 */

import { toText, type Renderable } from "./render.js";

/** Standard chat roles, open to custom roles like `"tool"`. */
export type Role = "system" | "user" | "assistant" | (string & {});

/** A single provider-neutral chat message. */
export interface Message {
  role: Role;
  content: string;
}

/** Chainable builder returned by {@link messages}. */
export interface MessageBuilder {
  /** Append a `system` message. */
  system(content: Renderable): MessageBuilder;
  /** Append a `user` message. */
  user(content: Renderable): MessageBuilder;
  /** Append an `assistant` message. */
  assistant(content: Renderable): MessageBuilder;
  /** Append a message with an arbitrary role. */
  push(role: Role, content: Renderable): MessageBuilder;
  /** Append already-built messages (e.g. from {@link fewShot}). */
  add(...msgs: Message[]): MessageBuilder;
  /** Number of messages accumulated so far. */
  readonly length: number;
  /** Return the finished, immutable `{ role, content }[]`. */
  build(): Message[];
}

/** Start a new chat message builder. */
export function messages(): MessageBuilder {
  const list: Message[] = [];
  const builder: MessageBuilder = {
    system(content) {
      list.push({ role: "system", content: toText(content) });
      return builder;
    },
    user(content) {
      list.push({ role: "user", content: toText(content) });
      return builder;
    },
    assistant(content) {
      list.push({ role: "assistant", content: toText(content) });
      return builder;
    },
    push(role, content) {
      list.push({ role, content: toText(content) });
      return builder;
    },
    add(...msgs) {
      for (const m of msgs) list.push({ role: m.role, content: m.content });
      return builder;
    },
    get length() {
      return list.length;
    },
    build() {
      return list.map((m) => ({ ...m }));
    },
  };
  return builder;
}
