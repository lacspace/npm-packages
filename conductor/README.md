# @lacspace/conductor

Let an AI **plan** and your code **run**. Many `@lacspace` packages expose a `describe()` that lists their commands and input schemas. Conductor turns those into one command catalogue that is cheap to put in a prompt. It then checks the plan a model writes against the catalogue and runs it step by step with your handlers. The model never executes anything; it only writes JSON that is validated first.

```ts
import * as quizpoll from "@lacspace/quizpoll";
import * as hookwriter from "@lacspace/hookwriter";
import { catalogue, planPrompt, validatePlan, execute, autoBind } from "@lacspace/conductor";

const cat = catalogue([quizpoll, hookwriter]);           // merge every describe()
const prompt = planPrompt("Make a quiz and an Instagram caption for this story", cat, { maxChars: 4000 });
const plan = JSON.parse(await llm(prompt));              // your model, any provider

const errors = validatePlan(plan, cat);                  // unknown commands, missing inputs, bad refs…
if (errors.length) throw new Error(errors.map((e) => e.message).join("; "));

const run = await execute(plan, {
  catalogue: cat,
  handlers: { ...autoBind(quizpoll, quizpoll.describe()), ...autoBind(hookwriter, hookwriter.describe()) },
  timeoutMs: 10_000,
  budgetMs: 60_000,
});
run.outputs; // { "<step id>": output, … }
```

## What it does

- **`catalogue(items)`:** merges `describe()` outputs into commands keyed `"pkg.command"`.
- **`catalogueForPrompt(cat, { maxChars, packages })`:** renders the catalogue as one line per command, with required inputs starred, so the prompt stays small.
- **`planPrompt(goal, cat, options)`:** the prompt that asks a model for a JSON plan. This is the only AI-shaped part of the kit.
- **`validatePlan(plan, cat)`:** returns a list of errors. It checks that:
  - every command exists;
  - required inputs are present;
  - types and enums match;
  - `$steps.<id>.output…` references point to earlier steps;
  - step ids are unique.
- **`execute(plan, { handlers, … })`:** runs the steps.
  - Inputs are filled in from earlier outputs (`"$steps.fetch.output.items.0"`).
  - `when` conditions decide whether a step runs.
  - `parallel` groups run concurrently.
  - Limits: per-step and default timeouts, a whole-plan `budgetMs`.
  - Steps marked `optional` can fail without stopping the plan.
  - `dryRun` resolves inputs but calls nothing.
  - `onStep` reports progress.
  - Pass `catalogue` to refuse an invalid plan before anything runs.
- **`autoBind(module, descriptor, overrides)`:** maps a package's exported functions to handlers.
- **`validate(value, schema)`:** the small JSON-schema checker used throughout.

Zero dependencies, isomorphic, dual ESM + CJS.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0): free for personal and commercial use.
