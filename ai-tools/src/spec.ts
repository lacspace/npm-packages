/**
 * Turn a resolved JSON Schema into the tool/function-declaration shape each
 * provider's API expects.
 */
import type { JSONSchema } from "./jsonSchema";

/** Supported LLM providers. */
export type Provider = "openai" | "anthropic" | "google";

/** OpenAI Chat Completions `tools[]` entry. */
export interface OpenAIToolSpec {
  type: "function";
  function: { name: string; description: string; parameters: JSONSchema };
}
/** Anthropic Messages `tools[]` entry. */
export interface AnthropicToolSpec {
  name: string;
  description: string;
  input_schema: JSONSchema;
}
/** Google Gemini function declaration (goes inside `tools[].functionDeclarations`). */
export interface GoogleToolSpec {
  name: string;
  description: string;
  parameters: JSONSchema;
}

export type ToolSpec = OpenAIToolSpec | AnthropicToolSpec | GoogleToolSpec;

const EMPTY_OBJECT_SCHEMA: JSONSchema = { type: "object", properties: {} };

/** Build the provider-shaped spec for one tool. */
export function buildSpec(
  provider: Provider,
  name: string,
  description: string,
  schema: JSONSchema | undefined,
): ToolSpec {
  const parameters = schema ?? EMPTY_OBJECT_SCHEMA;
  switch (provider) {
    case "openai":
      return { type: "function", function: { name, description, parameters } };
    case "anthropic":
      return { name, description, input_schema: parameters };
    case "google":
      return { name, description, parameters };
    default:
      throw new Error(
        `Unknown provider "${provider}". Use "openai", "anthropic" or "google".`,
      );
  }
}
