import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, expectTypeOf, it, vi } from "vitest";
import { primitives } from "@zerospin/schema";
import { makeViewForm } from "./makeViewForm";
import { makeView } from "./makeView";

it("infers defaults and form values and rejects invalid updates before publication", () => {
  const form = makeViewForm({
    shape: { alignment: primitives.enum({ values: ["left", "right"], defaultValue: "left" }) },
    form: ({ value, onChange }) => {
      expectTypeOf(value.alignment).toEqualTypeOf<"left" | "right">();
      onChange({ alignment: "right" });
      // @ts-expect-error The form's values come from the shape.
      onChange({ alignment: "invalid" });
      return createElement("span", null, value.alignment);
    },
  });
  expect(form.defaultValue).toEqual({ alignment: "left" });
  const onChange = vi.fn();
  expect(
    renderToStaticMarkup(createElement(form.form, { value: form.defaultValue, onChange })),
  ).toBe("<span>left</span>");
  expect(onChange).toHaveBeenCalledExactlyOnceWith({ alignment: "right" });
  const { component: View } = makeView({
    id: "test",
    label: "Test",
    w: 4,
    h: 4,
    order: 0,
    form,
    xs: (props: { breakpoint: "xs" | "sm" | "md" | "lg" | "xl" | "2xl"; viewOptions?: { alignment: string } }) =>
      createElement("span", null, props.viewOptions?.alignment),
  });
  expect(View.form).toBe(form);
  expect(
    renderToStaticMarkup(
      createElement(View, { breakpoint: "lg", viewOptions: { alignment: "right" } }),
    ),
  ).toBe("<span>right</span>");
  expect(renderToStaticMarkup(createElement(View, { breakpoint: "lg" }))).toBe("<span>left</span>");
});

it("generates labeled boolean switches and fills missing defaults without replacing false", () => {
  const form = makeViewForm({
    shape: {
      cardView: primitives.boolean({ defaultValue: false }),
      show_title: primitives.boolean({ defaultValue: true }),
    },
  });
  expect(form.decode({})).toEqual({ cardView: false, show_title: true });
  expect(form.decode({ show_title: false })).toEqual({ cardView: false, show_title: false });
  expect(() => form.decode({ cardView: "yes" })).toThrow();
  expect(() => form.decode({ unexpected: true })).toThrow();
  expect(() => form.decode(null)).toThrow();
  const html = renderToStaticMarkup(createElement(form.form, { value: {}, onChange: vi.fn() }));
  expect(html).toContain('aria-label="Card view"');
  expect(html).toContain('aria-label="Show title"');
  expect(html).toContain('role="switch"');
});

it("requires a custom form for unsupported automatic shapes", () => {
  expect(() => makeViewForm({ shape: { title: primitives.text({ defaultValue: "" }) } })).toThrow("title requires a custom form");
  expect(() => makeViewForm({ shape: { enabled: primitives.boolean({ nullable: true, defaultValue: false }) } })).toThrow("enabled requires a custom form");
  expect(() => makeViewForm({ shape: { enabled: primitives.boolean() } })).toThrow("enabled requires a custom form");
});

it("uses an explicit boolean form instead of generated switches", () => {
  const form = makeViewForm({
    shape: { cardView: primitives.boolean({ defaultValue: false }) },
    form: ({ value }) => createElement("span", null, String(value.cardView)),
  });
  expect(renderToStaticMarkup(createElement(form.form, { value: {}, onChange: vi.fn() }))).toBe("<span>false</span>");
});
