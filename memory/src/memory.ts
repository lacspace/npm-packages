/**
 * createMemory — a budget-aware conversation memory for LLM chat apps.
 *
 * Zero dependencies, keyless and isomorphic. Token counting and summarization
 * are **injected** (`countTokens`, `summarize`), so the package never bundles a
 * tokenizer and never touches the network. The window it produces uses the same
 * {@link Message} shape as `@lacspace/ai` / `@lacspace/agent`.
 */

import type {
  CountTokens,
  Memory,
  MemoryOptions,
  MemorySnapshot,
  Message,
  Summarize,
} from "./types";
import {
  defaultCountTokens,
  estimateMessageTokens,
  estimateOne,
  trimToTokenBudget,
} from "./helpers";

function clone(m: Message): Message {
  const out: Message = { role: m.role, content: m.content };
  if (m.name !== undefined) out.name = m.name;
  if (m.toolCallId !== undefined) out.toolCallId = m.toolCallId;
  if (m.toolCalls !== undefined) out.toolCalls = m.toolCalls;
  return out;
}

/**
 * Create a {@link Memory}.
 *
 * ```ts
 * const mem = createMemory({ system: "You are helpful.", maxTokens: 3000, keepLast: 4 });
 * mem.addUser("Hi!");
 * mem.addAssistant("Hello — how can I help?");
 * await mem.prune();          // fold/drop old turns to fit the budget
 * const window = mem.messages(); // send straight to an LLM
 * ```
 */
export function createMemory(opts: MemoryOptions = {}): Memory {
  let sys: string | undefined = opts.system;
  const count: CountTokens = opts.countTokens ?? defaultCountTokens;
  const summarize: Summarize | undefined = opts.summarize;
  const keepSystem = opts.keepSystem ?? true;
  const keepLast = Math.max(0, opts.keepLast ?? 2);
  const maxMessages = opts.maxMessages;
  const maxTokens = opts.maxTokens;

  let win: Message[] = [];
  let hist: Message[] = [];

  const systemMessage = (): Message | undefined =>
    sys != null ? { role: "system", content: sys } : undefined;

  const systemCost = (): number => {
    const s = systemMessage();
    return s ? estimateOne(s, count) : 0;
  };

  const full = (): Message[] => {
    const s = systemMessage();
    return s ? [s, ...win.map(clone)] : win.map(clone);
  };

  const overBudget = (arr: Message[]): boolean => {
    if (maxMessages != null && arr.length > maxMessages) return true;
    if (
      maxTokens != null &&
      estimateMessageTokens(arr, count) + systemCost() > maxTokens
    ) {
      return true;
    }
    return false;
  };

  /** Plan a prune: which messages survive and which get dropped (oldest first). */
  const plan = (): { survivors: Message[]; dropped: Message[] } => {
    const kept = win.map(clone);
    const dropped: Message[] = [];
    const isProtected = (arr: Message[], i: number): boolean => {
      if (keepSystem && arr[i]!.role === "system") return true;
      if (i >= arr.length - keepLast) return true;
      return false;
    };
    while (overBudget(kept)) {
      const idx = kept.findIndex((_, i) => !isProtected(kept, i));
      if (idx === -1) break; // nothing droppable
      dropped.push(kept[idx]!);
      kept.splice(idx, 1);
    }
    return { survivors: kept, dropped };
  };

  const push = (m: Message): void => {
    const c = clone(m);
    win.push(c);
    hist.push(clone(m));
  };

  const memory: Memory = {
    add(message) {
      if (Array.isArray(message)) for (const m of message) push(m);
      else push(message);
    },
    addUser(content) {
      push({ role: "user", content });
    },
    addAssistant(content) {
      push({ role: "assistant", content });
    },
    addTool(content, toolCallId) {
      const m: Message = { role: "tool", content };
      if (toolCallId !== undefined) m.toolCallId = toolCallId;
      push(m);
    },
    messages() {
      return full();
    },
    history() {
      return hist.map(clone);
    },
    clear() {
      win = [];
      hist = [];
    },
    get size() {
      return win.length + (sys != null ? 1 : 0);
    },
    toWindow(o) {
      const trimmed = trimToTokenBudget(win, {
        maxTokens:
          o?.maxTokens != null
            ? o.maxTokens - systemCost()
            : maxTokens != null
              ? maxTokens - systemCost()
              : undefined,
        maxMessages: o?.maxMessages ?? maxMessages,
        countTokens: count,
        keepSystem,
        keepLast,
      });
      const s = systemMessage();
      return s ? [s, ...trimmed] : trimmed;
    },
    async prune() {
      if (!overBudget(win)) return;
      const { survivors, dropped } = plan();
      if (summarize && dropped.length > 0) {
        const text = await summarize(dropped.map(clone));
        const note: Message = {
          role: "system",
          content: text,
          name: "memory_summary",
        };
        win = [note, ...survivors];
      } else {
        win = survivors;
      }
    },
    toJSON() {
      const snap: MemorySnapshot = {
        history: hist.map(clone),
        window: win.map(clone),
      };
      if (sys != null) snap.system = sys;
      return snap;
    },
    fromJSON(data) {
      sys = data.system ?? sys;
      hist = Array.isArray(data.history) ? data.history.map(clone) : [];
      win = Array.isArray(data.window) ? data.window.map(clone) : [];
    },
    load(data) {
      memory.fromJSON(data);
    },
  };

  return memory;
}
