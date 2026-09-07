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
