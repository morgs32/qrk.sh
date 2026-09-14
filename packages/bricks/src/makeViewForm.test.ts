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
    xs: (props: { breakpoint: "xs" | "sm" | "md" | "lg"; viewOptions?: { alignment: string } }) =>
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
