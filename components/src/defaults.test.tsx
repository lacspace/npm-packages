import { test, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

import { Breadcrumbs, Stepper, CheckboxGroup, Combobox, MultiSelect, RadioGroup, ToggleGroup, MetricBar, Tree } from "./index";

// Every data-driven component used to crash with `Cannot read properties of
// undefined (reading 'map')` when its collection prop was omitted. A missing
// collection now renders an empty component — the type still requires the
// prop, so TypeScript users are told; JavaScript users are no longer crashed.
const render = (C: unknown) => renderToString(React.createElement(C as React.ComponentType));

test("Breadcrumbs renders without its collection prop", () => {
  expect(() => render(Breadcrumbs)).not.toThrow();
  expect(render(Breadcrumbs)).toContain("<nav");
});

test("Stepper renders without its collection prop", () => {
  expect(() => render(Stepper)).not.toThrow();
});

test("CheckboxGroup renders without its collection prop", () => {
  expect(() => render(CheckboxGroup)).not.toThrow();
});

test("Combobox renders without its collection prop", () => {
  expect(() => render(Combobox)).not.toThrow();
});

test("MultiSelect renders without its collection prop", () => {
  expect(() => render(MultiSelect)).not.toThrow();
});

test("RadioGroup renders without its collection prop", () => {
  expect(() => render(RadioGroup)).not.toThrow();
});

test("ToggleGroup renders without its collection prop", () => {
  expect(() => render(ToggleGroup)).not.toThrow();
});

test("MetricBar renders without its collection prop", () => {
  expect(() => render(MetricBar)).not.toThrow();
});

test("Tree renders without its collection prop", () => {
  expect(() => render(Tree)).not.toThrow();
});

