import { test, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

import { ScheduleGrid } from "./index";

// Every data-driven component used to crash with `Cannot read properties of
// undefined (reading 'map')` when its collection prop was omitted. A missing
// collection now renders an empty component — the type still requires the
// prop, so TypeScript users are told; JavaScript users are no longer crashed.
const render = (C: unknown) => renderToString(React.createElement(C as React.ComponentType));

test("ScheduleGrid renders without its collection prop", () => {
  expect(() => render(ScheduleGrid)).not.toThrow();
  // With no startDate the grid starts today, not on `undefined.getFullYear()`.
  expect(render(ScheduleGrid)).toContain(String(new Date().getFullYear()));
});

