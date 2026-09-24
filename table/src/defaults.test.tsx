import { test, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

import { DataTable, TableColumnsMenu, TableCheckbox } from "./index";

// Every data-driven component used to crash with `Cannot read properties of
// undefined (reading 'map')` when its collection prop was omitted. A missing
// collection now renders an empty component — the type still requires the
// prop, so TypeScript users are told; JavaScript users are no longer crashed.
const render = (C: unknown) => renderToString(React.createElement(C as React.ComponentType));

test("DataTable renders without its collection prop", () => {
  expect(() => render(DataTable)).not.toThrow();
  expect(render(DataTable)).toContain("<table");
});

test("TableColumnsMenu renders without its collection prop", () => {
  expect(() => render(TableColumnsMenu)).not.toThrow();
});

test("TableCheckbox renders without its collection prop", () => {
  expect(() => render(TableCheckbox)).not.toThrow();
  // The kit owns this input, so it is always labelled — even with no `label` prop.
  expect(render(TableCheckbox)).toContain('aria-label="Select"');
});

