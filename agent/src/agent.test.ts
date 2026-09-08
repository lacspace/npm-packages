import { test, expect, vi } from "vitest";
import {
  createAgent,
  runAgent,
  defineTool,
  type ChatFn,
  type ChatResult,
  type Message,
  type AgentStep,
} from "./index";

/**
 * A deterministic fake `chat`: it returns each scripted turn in order, so a
 * test can script "call this tool, then answer with text" with no network.
 */
function scriptedChat(turns: ChatResult[]): {
  chat: ChatFn;
  calls: { messages: Message[]; tools?: unknown }[];
} {
  const calls: { messages: Message[]; tools?: unknown }[] = [];
  let i = 0;
  const chat: ChatFn = async (messages, opts) => {
    calls.push({ messages: messages.map((m) => ({ ...m })), tools: opts?.tools });
    const turn = turns[Math.min(i, turns.length - 1)];
    i++;
    return turn!;
  };
  return { chat, calls };
}

const answer = (content: string): ChatResult => ({ content });
const callTool = (name: string, args: Record<string, unknown>, id = `c${name}`): ChatResult => ({
  content: "",
  toolCalls: [{ id, name, arguments: args }],
});

test("no-tool: returns the model's direct answer with finishReason stop", async () => {
  const { chat } = scriptedChat([answer("Hello there")]);
  const agent = createAgent({ chat });
  const run = await agent.run("hi");
  expect(run.output).toBe("Hello there");
  expect(run.finishReason).toBe("stop");
  expect(run.toolCalls).toHaveLength(0);
});

test("single tool call → result → final answer", async () => {
  const { chat } = scriptedChat([
    callTool("add", { a: 2, b: 3 }),
    answer("The sum is 5"),
  ]);
  const add = defineTool("add", {
    handler: ({ a, b }) => (a as number) + (b as number),
  });
  const run = await createAgent({ chat, tools: [add] }).run("add 2 and 3");
  expect(run.output).toBe("The sum is 5");
  expect(run.finishReason).toBe("stop");
  expect(run.toolCalls).toHaveLength(1);
  expect(run.toolCalls[0]!.name).toBe("add");
});

test("tool result is appended as a role:tool message with the call id", async () => {
  const { chat } = scriptedChat([callTool("echo", { x: "hi" }, "call-1"), answer("done")]);
  const echo = defineTool("echo", { handler: (a) => a });
  const run = await createAgent({ chat, tools: [echo] }).run("go");
  const toolMsg = run.messages.find((m) => m.role === "tool");
  expect(toolMsg).toBeDefined();
  expect(toolMsg!.toolCallId).toBe("call-1");
  expect(toolMsg!.name).toBe("echo");
  expect(toolMsg!.content).toBe(JSON.stringify({ x: "hi" }));
});

test("multi-step: two sequential tool calls then an answer", async () => {
  const { chat } = scriptedChat([
    callTool("step1", {}, "a"),
    callTool("step2", {}, "b"),
    answer("finished"),
  ]);
  const t1 = defineTool("step1", { handler: () => "one" });
  const t2 = defineTool("step2", { handler: () => "two" });
  const run = await createAgent({ chat, tools: [t1, t2] }).run("chain");
  expect(run.output).toBe("finished");
  expect(run.toolCalls.map((c) => c.name)).toEqual(["step1", "step2"]);
  expect(run.finishReason).toBe("stop");
});

test("maxSteps cap: never terminates, hits max_steps", async () => {
  // Always requests a tool → the loop can only ever stop on the guard.
  const { chat, calls } = scriptedChat([callTool("loop", {}, "x")]);
  const loop = defineTool("loop", { handler: () => "again" });
  const run = await createAgent({ chat, tools: [loop], maxSteps: 3 }).run("go");
  expect(run.finishReason).toBe("max_steps");
  expect(calls.length).toBe(3);
});

test("per-run maxSteps overrides the agent default", async () => {
  const { chat, calls } = scriptedChat([callTool("loop", {}, "x")]);
  const loop = defineTool("loop", { handler: () => "again" });
  const run = await createAgent({ chat, tools: [loop], maxSteps: 8 }).run("go", { maxSteps: 2 });
  expect(run.finishReason).toBe("max_steps");
  expect(calls.length).toBe(2);
});

test("tool handler throwing is recovered into a tool result and the loop continues", async () => {
  const { chat } = scriptedChat([callTool("boom", {}, "b"), answer("recovered")]);
  const boom = defineTool("boom", {
    handler: () => {
      throw new Error("kaboom");
    },
  });
  const run = await createAgent({ chat, tools: [boom] }).run("go");
  expect(run.output).toBe("recovered");
  expect(run.finishReason).toBe("stop");
  const resultStep = run.steps.find((s) => s.type === "tool_result");
  expect(resultStep && "error" in resultStep ? resultStep.error : undefined).toBe("kaboom");
  // The error is fed back to the model as the tool message content.
  const toolMsg = run.messages.find((m) => m.role === "tool");
  expect(toolMsg!.content).toContain("kaboom");
});

test("unknown tool name is recovered, not thrown", async () => {
  const { chat } = scriptedChat([callTool("ghost", {}, "g"), answer("ok")]);
  const run = await createAgent({ chat, tools: [] }).run("go");
  expect(run.output).toBe("ok");
  const resultStep = run.steps.find((s) => s.type === "tool_result");
  expect(resultStep && "error" in resultStep ? resultStep.error : "").toContain("Unknown tool");
});

test("onStep callback fires for message, tool_call and tool_result", async () => {
  const { chat } = scriptedChat([callTool("t", {}, "1"), answer("done")]);
  const steps: AgentStep[] = [];
  const t = defineTool("t", { handler: () => 42 });
  await createAgent({ chat, tools: [t], onStep: (s) => steps.push(s) }).run("go");
  const types = steps.map((s) => s.type);
  expect(types).toContain("message");
  expect(types).toContain("tool_call");
  expect(types).toContain("tool_result");
});

test("abort signal that is already aborted stops immediately with error", async () => {
  const { chat, calls } = scriptedChat([answer("should not run")]);
  const controller = new AbortController();
  controller.abort();
  const run = await createAgent({ chat }).run("go", { signal: controller.signal });
  expect(run.finishReason).toBe("error");
  expect(calls.length).toBe(0);
});

test("abort mid-loop: chat rejecting with AbortError yields finishReason error", async () => {
  const controller = new AbortController();
  const chat: ChatFn = async () => {
    controller.abort();
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  };
  const run = await createAgent({ chat }).run("go", { signal: controller.signal });
  expect(run.finishReason).toBe("error");
});

test("signal is forwarded to the chat function", async () => {
  const controller = new AbortController();
  let seen: AbortSignal | undefined;
  const chat: ChatFn = async (_m, opts) => {
    seen = opts?.signal;
    return answer("ok");
  };
  await createAgent({ chat }).run("go", { signal: controller.signal });
  expect(seen).toBe(controller.signal);
});

test("systemPrompt is prepended when the input has no system message", async () => {
  const { chat, calls } = scriptedChat([answer("ok")]);
  await createAgent({ chat, systemPrompt: "You are helpful." }).run("hi");
  expect(calls[0]!.messages[0]).toMatchObject({ role: "system", content: "You are helpful." });
});

test("systemPrompt is NOT added when the caller already supplied one", async () => {
  const { chat, calls } = scriptedChat([answer("ok")]);
  const input: Message[] = [
    { role: "system", content: "Custom system" },
    { role: "user", content: "hi" },
  ];
  await createAgent({ chat, systemPrompt: "Default" }).run(input);
  const systemMsgs = calls[0]!.messages.filter((m) => m.role === "system");
  expect(systemMsgs).toHaveLength(1);
  expect(systemMsgs[0]!.content).toBe("Custom system");
});

test("string input is wrapped as a single user message", async () => {
  const { chat, calls } = scriptedChat([answer("ok")]);
  await createAgent({ chat }).run("just this");
  expect(calls[0]!.messages).toEqual([{ role: "user", content: "just this" }]);
});

test("message-array input is passed through and not mutated", async () => {
  const { chat } = scriptedChat([answer("ok")]);
  const input: Message[] = [{ role: "user", content: "original" }];
  const run = await createAgent({ chat }).run(input);
  // The caller's array is untouched; the run has its own accumulated copy.
  expect(input).toHaveLength(1);
  expect(run.messages.length).toBeGreaterThan(1);
});

test("tools are forwarded to chat on every turn", async () => {
  const { chat, calls } = scriptedChat([callTool("t", {}, "1"), answer("done")]);
  const t = defineTool("t", { handler: () => 1 });
  await createAgent({ chat, tools: [t] }).run("go");
  expect((calls[0]!.tools as unknown[]).length).toBe(1);
  expect((calls[1]!.tools as unknown[]).length).toBe(1);
});

test("async tool handlers are awaited", async () => {
  const { chat } = scriptedChat([callTool("slow", {}, "s"), answer("done")]);
  const slow = defineTool("slow", {
    handler: async () => {
      await Promise.resolve();
      return "async-result";
    },
  });
  const run = await createAgent({ chat, tools: [slow] }).run("go");
  const step = run.steps.find((s) => s.type === "tool_result");
  expect(step && "result" in step ? step.result : undefined).toBe("async-result");
});

test("string tool results are passed through verbatim (not double-JSON'd)", async () => {
  const { chat } = scriptedChat([callTool("s", {}, "1"), answer("done")]);
  const s = defineTool("s", { handler: () => "plain text" });
  const run = await createAgent({ chat, tools: [s] }).run("go");
  const toolMsg = run.messages.find((m) => m.role === "tool");
  expect(toolMsg!.content).toBe("plain text");
});

test("runAgent one-shot returns the same result as createAgent().run", async () => {
  const { chat } = scriptedChat([callTool("t", {}, "1"), answer("final")]);
  const t = defineTool("t", { handler: () => 1 });
  const run = await runAgent({ chat, tools: [t], input: "go" });
  expect(run.output).toBe("final");
  expect(run.finishReason).toBe("stop");
});

test("steps trace ordering is message → tool_call → tool_result → message", async () => {
  const { chat } = scriptedChat([callTool("t", {}, "1"), answer("done")]);
  const t = defineTool("t", { handler: () => 1 });
  const run = await createAgent({ chat, tools: [t] }).run("go");
  expect(run.steps.map((s) => s.type)).toEqual([
    "message",
    "tool_call",
    "tool_result",
    "message",
  ]);
});

test("onStep is called exactly once per step", async () => {
  const { chat } = scriptedChat([answer("hi")]);
  const onStep = vi.fn();
  await createAgent({ chat, onStep }).run("go");
  expect(onStep).toHaveBeenCalledTimes(1);
});

test("createAgent throws without a chat function", () => {
  // @ts-expect-error intentionally missing chat
  expect(() => createAgent({})).toThrow(/chat/);
});

test("parallel tool calls in one turn are all dispatched", async () => {
  const { chat } = scriptedChat([
    { content: "", toolCalls: [
      { id: "a", name: "t1", arguments: {} },
      { id: "b", name: "t2", arguments: {} },
    ] },
    answer("both done"),
  ]);
  const t1 = defineTool("t1", { handler: () => "one" });
  const t2 = defineTool("t2", { handler: () => "two" });
  const run = await createAgent({ chat, tools: [t1, t2] }).run("go");
  expect(run.toolCalls).toHaveLength(2);
  expect(run.messages.filter((m) => m.role === "tool")).toHaveLength(2);
  expect(run.output).toBe("both done");
});
