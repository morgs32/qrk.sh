import { createElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, expectTypeOf, it } from "vitest";
import { makeView } from "./makeView";

function Xs(props: { breakpoint: "xs" | "sm" | "lg" | "xl"; data: { label: string } }) {
  const [label] = useState(props.data.label);
  return createElement("span", null, `xs:${label}:${props.breakpoint}`);
}
function Lg(props: Parameters<typeof Xs>[0]) {
  return createElement("span", null, `lg:${props.data.label}:${props.breakpoint}`);
}

describe("makeView", () => {
  it("validates view IDs and retains metadata independently of dimensions", () => {
    const view = makeView({ id: "summary", label: "Summary", w: 4, h: 2, order: 3, xs: Xs });
    expectTypeOf(view.id).toEqualTypeOf<"summary">();
    expect(view).toMatchObject({ id: "summary", label: "Summary", w: 4, h: 2, order: 3 });
    for (const id of ["", "Summary", "two words", "-summary", "summary-"]) {
      expect(() => makeView({ id, label: "Summary", w: 4, h: 2, order: 0, xs: Xs })).toThrow(
        "makeView: id must be kebab-case",
      );
    }
  });

  it("inherits omitted breakpoints and forwards props to hook-using components", () => {
    const { component: View } = makeView({
      id: "test",
      label: "Test",
      w: 4,
      h: 4,
      order: 0,
      xs: Xs,
      lg: Lg,
    });
    for (const breakpoint of ["xs", "sm", "lg", "xl"] satisfies Array<"xs" | "sm" | "lg" | "xl">) {
      const expected = breakpoint === "xs" || breakpoint === "sm" ? "xs" : "lg";
      expect(
        renderToStaticMarkup(createElement(View, { breakpoint, data: { label: "profile" } })),
      ).toBe(`<span>${expected}:profile:${breakpoint}</span>`);
    }
    expectTypeOf<Parameters<typeof View>[0]["data"]>().toEqualTypeOf<{ label: string }>();
  });

  it("selects explicit sm and lg overrides", () => {
    const { component: View } = makeView({
      id: "test",
      label: "Test",
      w: 4,
      h: 4,
      order: 0,
      xs: Xs,
      sm: Lg,
      lg: Xs,
    });
    expect(
      renderToStaticMarkup(createElement(View, { breakpoint: "sm", data: { label: "a" } })),
    ).toBe("<span>lg:a:sm</span>");
    expect(
      renderToStaticMarkup(createElement(View, { breakpoint: "lg", data: { label: "a" } })),
    ).toBe("<span>xs:a:lg</span>");
  });

  it("requires xs and rejects incompatible data props", () => {
    // @ts-expect-error xs is the required base presentation.
    makeView({ id: "test", label: "Test", w: 4, h: 4, order: 0, lg: Lg });
    makeView({
      id: "test",
      label: "Test",
      w: 4,
      h: 4,
      order: 0,
      xs: Xs,
      // @ts-expect-error Every presentation must accept the base presentation's data.
      lg: (_props: { breakpoint: "xs" | "sm" | "lg" | "xl"; data: { label: number } }) => null,
    });
  });
});

it("selects xl and otherwise inherits lg", () => {
  const base = { id: "large", label: "Large", w: 4, h: 4, order: 0, xs: Xs, lg: Lg };
  const inherited = makeView(base).component;
  const xl = makeView({ ...base, xl: Xs }).component;
  expect(renderToStaticMarkup(createElement(inherited, { breakpoint: "xl", data: { label: "a" } }))).toBe("<span>lg:a:xl</span>");
  expect(renderToStaticMarkup(createElement(xl, { breakpoint: "xl", data: { label: "a" } }))).toBe("<span>xs:a:xl</span>");
});
