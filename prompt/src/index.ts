/**
 * @lacspace/prompt — a tiny, typed prompt-engineering toolkit.
 *
 * Build, compose and render LLM prompts and chat messages with real type
 * safety. Variable names are inferred from the template string, so `.render()`
 * is type-checked. Zero dependencies, isomorphic, provider-agnostic.
 *
 * @packageDocumentation
 */

export {
  prompt,
  render,
  Prompt,
  isPrompt,
  toText,
  type Renderable,
  type PromptValue,
  type RequiredVars,
  type OptionalVars,
  type RenderVars,
  type RenderArgs,
} from "./render.js";

export {
  messages,
  type Message,
  type Role,
  type MessageBuilder,
} from "./messages.js";

export {
  fewShot,
  type Example,
  type FewShotMessagesOptions,
  type FewShotTextOptions,
} from "./fewshot.js";

export { section, list, numbered, xml, json, codeBlock, join } from "./format.js";

export {
  guard,
  escapeBraces,
  defangTag,
  type GuardOptions,
} from "./guard.js";

export {
  jsonInstruction,
  enumInstruction,
  type JsonInstructionOptions,
  type EnumInstructionOptions,
} from "./instruct.js";

export {
  estimateTokens,
  fitText,
  trimMessages,
  DEFAULT_CHARS_PER_TOKEN,
  type EstimateOptions,
  type FitTextOptions,
  type TrimMessagesOptions,
  type TrimStrategy,
} from "./budget.js";

export {
  createRegistry,
  type PromptRegistry,
  type RegisteredPrompt,
  type RegisterOptions,
} from "./registry.js";
