import { test, expect, vi } from "vitest";
import {
  defineTool,
  toolbox,
  jsonSchema,
  ToolArgumentError,
  type JSONSchema,
} from "./index";

const weatherSchema: JSONSchema = {
  type: "object",
  properties: {
    city: { type: "string" },
    units: { type: "string", enum: ["metric", "imperial"] },
    days: { type: "integer" },
  },
  required: ["city"],
  additionalProperties: false,
};

function weatherTool() {
  return defineTool({
    name: "get_weather",
    description: "Get the weather for a city.",
    parameters: weatherSchema,
    handler: (args: { city: string; units?: string; days?: number }) => ({
      city: args.city,
      tempC: 21,
      units: args.units ?? "metric",
    }),
  });
}

test("plain JSON Schema → correct OpenAI spec", () => {
  const spec = weatherTool().spec("openai") as any;
  expect(spec.type).toBe("function");
  expect(spec.function.name).toBe("get_weather");
  expect(spec.function.description).toBe("Get the weather for a city.");
  expect(spec.function.parameters).toEqual(weatherSchema);
});

test("plain JSON Schema → correct Anthropic spec (input_schema)", () => {
  const spec = weatherTool().spec("anthropic") as any;
  expect(spec.name).toBe("get_weather");
  expect(spec.input_schema).toEqual(weatherSchema);
  expect(spec.function).toBeUndefined();
});

test("plain JSON Schema → correct Google spec (parameters)", () => {
  const spec = weatherTool().spec("google") as any;
  expect(spec.name).toBe("get_weather");
  expect(spec.parameters).toEqual(weatherSchema);
  expect(spec.input_schema).toBeUndefined();
});

test(".run rejects missing required args", async () => {
  await expect(weatherTool().run({ units: "metric" })).rejects.toBeInstanceOf(
    ToolArgumentError,
  );
});

test(".run rejects wrong-typed args", async () => {
  await expect(weatherTool().run({ city: 123 })).rejects.toBeInstanceOf(
    ToolArgumentError,
  );
});

test(".run rejects an invalid enum member", async () => {
  await expect(
    weatherTool().run({ city: "Kathmandu", units: "kelvin" }),
  ).rejects.toBeInstanceOf(ToolArgumentError);
});

test(".run accepts valid args and returns the handler result", async () => {
  const out = await weatherTool().run({ city: "Kathmandu", units: "imperial" });
  expect(out).toEqual({ city: "Kathmandu", tempC: 21, units: "imperial" });
});

test(".run coerces a numeric string when the schema says integer", async () => {
  const tool = defineTool({
    name: "echo_days",
    description: "Echo the day count.",
    parameters: { type: "object", properties: { days: { type: "integer" } }, required: ["days"] },
    handler: (a: { days: number }) => a.days,
  });
  expect(await tool.run({ days: "5" })).toBe(5);
  await expect(tool.run({ days: "5.5" })).rejects.toBeInstanceOf(ToolArgumentError);
});

test("duck-typed schema with .parse() is used for validation", async () => {
  const parse = vi.fn((x: any): { name: string } => {
    if (typeof x?.name !== "string") throw new Error("name must be a string");
    return { name: x.name.toUpperCase() };
  });
  const tool = defineTool({
    name: "shout",
    description: "Uppercase a name.",
    parameters: { parse },
    handler: (a) => a.name,
  });
  expect(await tool.run({ name: "ada" })).toBe("ADA");
  expect(parse).toHaveBeenCalledTimes(1);
  await expect(tool.run({ name: 42 })).rejects.toThrow("name must be a string");
});

test("toJsonSchema-style schema feeds the spec and .parse validates", async () => {
  const schema = {
    toJsonSchema: () => ({ type: "object", properties: { q: { type: "string" } }, required: ["q"] }),
    parse: (x: any): { q: string } => {
      if (!x || typeof x.q !== "string") throw new Error("q required");
      return x;
    },
  };
  const tool = defineTool({
    name: "search",
    description: "Search.",
    parameters: schema,
    handler: (a) => `results for ${a.q}`,
  });
  const spec = tool.spec("anthropic") as any;
  expect(spec.input_schema.required).toEqual(["q"]);
  expect(await tool.run({ q: "hi" })).toBe("results for hi");
  await expect(tool.run({})).rejects.toThrow("q required");
});

test("jsonSchema builder produces the expected shape", () => {
  const schema = jsonSchema
    .object({
      city: jsonSchema.string("City name"),
      units: jsonSchema.enum(["metric", "imperial"]).optional(),
      tags: jsonSchema.array(jsonSchema.string()),
      count: jsonSchema.number(),
      active: jsonSchema.boolean().optional(),
    })
    .toJsonSchema();

  expect(schema).toEqual({
    type: "object",
    additionalProperties: false,
    required: ["city", "tags", "count"],
    properties: {
      city: { type: "string", description: "City name" },
      units: { type: "string", enum: ["metric", "imperial"] },
      tags: { type: "array", items: { type: "string" } },
      count: { type: "number" },
      active: { type: "boolean" },
    },
  });
});

test("defineTool + jsonSchema builder end-to-end", async () => {
  const tool = defineTool({
    name: "greet",
    description: "Greet someone.",
    parameters: jsonSchema.object({
      name: jsonSchema.string(),
      loud: jsonSchema.boolean().optional(),
    }),
    handler: ({ name, loud }) => (loud ? `HI ${name}!` : `hi ${name}`),
  });
  expect(await tool.run({ name: "Ada", loud: true })).toBe("HI Ada!");
  await expect(tool.run({ loud: true })).rejects.toBeInstanceOf(ToolArgumentError);
});

test("toolbox.specs(provider) returns every tool's spec", () => {
  const a = weatherTool();
  const b = defineTool({
    name: "add",
    description: "Add two numbers.",
    parameters: jsonSchema.object({ x: jsonSchema.number(), y: jsonSchema.number() }),
    handler: ({ x, y }) => x + y,
  });
  const kit = toolbox([a, b]);
  expect(kit.names).toEqual(["get_weather", "add"]);
  const specs = kit.specs("openai") as any[];
  expect(specs).toHaveLength(2);
  expect(specs.map((s) => s.function.name)).toEqual(["get_weather", "add"]);
  expect(kit.get("add")).toBe(b);
  expect(kit.get("nope")).toBeUndefined();
});

test("dispatch routes a call with stringified JSON arguments", async () => {
  const kit = toolbox([weatherTool()]);
  const res = await kit.dispatch({
    id: "call_1",
    name: "get_weather",
    arguments: '{"city":"Pokhara","units":"metric"}',
  });
  expect(res).toEqual({
    name: "get_weather",
    id: "call_1",
    result: { city: "Pokhara", tempC: 21, units: "metric" },
  });
});

test("dispatch tolerates OpenAI-shaped and Anthropic-shaped calls", async () => {
  const kit = toolbox([weatherTool()]);
  const openai = await kit.dispatch({
    function: { name: "get_weather", arguments: '{"city":"Lalitpur"}' },
  });
  expect((openai.result as any).city).toBe("Lalitpur");

  const anthropic = await kit.dispatch({
    type: "tool_use",
    name: "get_weather",
    input: { city: "Bhaktapur" },
  } as any);
  expect((anthropic.result as any).city).toBe("Bhaktapur");
});

test("dispatch returns an error result for an unknown tool or bad args", async () => {
  const kit = toolbox([weatherTool()]);
  const missing = await kit.dispatch({ name: "nope", arguments: "{}" });
  expect(missing.isError).toBe(true);
  expect(missing.error).toContain("No tool named");

  const bad = await kit.dispatch({ name: "get_weather", arguments: "{}" });
  expect(bad.isError).toBe(true);
  expect(bad.error).toContain("required");
});

test("dispatchAll handles a batch", async () => {
  const add = defineTool({
    name: "add",
    description: "Add.",
    parameters: jsonSchema.object({ x: jsonSchema.number(), y: jsonSchema.number() }),
    handler: ({ x, y }) => x + y,
  });
  const kit = toolbox([add, weatherTool()]);
  const results = await kit.dispatchAll([
    { name: "add", arguments: '{"x":2,"y":3}' },
    { name: "get_weather", arguments: { city: "Kathmandu" } },
  ]);
  expect(results).toHaveLength(2);
  expect(results[0]!.result).toBe(5);
  expect((results[1]!.result as any).city).toBe("Kathmandu");
});
