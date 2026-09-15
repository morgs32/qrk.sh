import { createElement, useState } from "react";

import { primitives } from "@zerospin/schema";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, expectTypeOf, it } from "vitest";

import { makeCatalog } from "./makeCatalog";

function Xs(props: { breakpoint: "xs" | "sm" | "lg" | "xl"; data: { label: string } }) {
  const [label] = useState(props.data.label);
  return createElement("span", null, `xs:${label}:${props.breakpoint}`);
}
function Lg(props: Parameters<typeof Xs>[0]) {
  return createElement("span", null, `lg:${props.data.label}:${props.breakpoint}`);
}

describe("makeCatalog", () => {
  it("validates view IDs and retains metadata independently of dimensions", () => {
    const view = makeCatalog({
      catalogDescription: "Test",
      dataShape: { label: primitives.text() },
      defaultData: { label: "Default" },
      catalog: "summary",
      catalogName: "Summary",
      order: 3,
      xs: { component: Xs, w: 4, h: 2 },
    });
    expectTypeOf(view.def.catalog).toEqualTypeOf<"summary">();
    expect(view.def).toMatchObject({
      catalog: "summary",
      label: "Summary",
      xs: { w: 4, h: 2 },
      order: 3,
    });
    for (const breakpoint of ["xs", "sm", "lg", "xl"] satisfies Array<"xs" | "sm" | "lg" | "xl">) {
      expect(view.def[breakpoint]).toEqual({ w: 4, h: 2 });
      expect(
        renderToStaticMarkup(
          createElement(view.component, { breakpoint, data: { label: "base" } }),
        ),
      ).toBe(`<span>xs:base:${breakpoint}</span>`);
    }
    expect(view.def).not.toHaveProperty("w");
    expect(view.def).not.toHaveProperty("h");
    for (const id of ["", "Summary", "two words", "-summary", "summary-"]) {
      expect(() =>
        makeCatalog({
          catalogDescription: "Test",
          dataShape: { label: primitives.text() },
          defaultData: { label: "Default" },
          catalog: id,
          catalogName: "Summary",
          order: 0,
          xs: { component: Xs, w: 4, h: 2 },
        }),
      ).toThrow("makeCatalog: catalog must be kebab-case");
    }
  });

  it("inherits omitted breakpoints and forwards props to hook-using components", () => {
    const { component: View, def } = makeCatalog({
      catalogDescription: "Test",
      dataShape: { label: primitives.text() },
      defaultData: { label: "Default" },
      catalog: "test",
      catalogName: "Test",
      order: 0,
      xs: { component: Xs, w: 4, h: 4 },
      lg: { component: Lg, w: 8, h: 2 },
    });
    for (const breakpoint of ["xs", "sm", "lg", "xl"] satisfies Array<"xs" | "sm" | "lg" | "xl">) {
      const expected = breakpoint === "xs" || breakpoint === "sm" ? "xs" : "lg";
      expect(def[breakpoint]).toEqual(expected === "xs" ? { w: 4, h: 4 } : { w: 8, h: 2 });
      expect(
        renderToStaticMarkup(createElement(View, { breakpoint, data: { label: "profile" } })),
      ).toBe(`<span>${expected}:profile:${breakpoint}</span>`);
    }
    expectTypeOf<Parameters<typeof View>[0]["data"]>().toEqualTypeOf<{
      label: string;
    }>();
  });

  it("selects explicit sm and lg overrides", () => {
    const { component: View } = makeCatalog({
      catalogDescription: "Test",
      dataShape: { label: primitives.text() },
      defaultData: { label: "Default" },
      catalog: "test",
      catalogName: "Test",
      order: 0,
      xs: { component: Xs, w: 4, h: 4 },
      sm: { component: Lg, w: 4, h: 4 },
      lg: { component: Xs, w: 4, h: 4 },
    });
    expect(
      renderToStaticMarkup(createElement(View, { breakpoint: "sm", data: { label: "a" } })),
    ).toBe("<span>lg:a:sm</span>");
    expect(
      renderToStaticMarkup(createElement(View, { breakpoint: "lg", data: { label: "a" } })),
    ).toBe("<span>xs:a:lg</span>");
  });

  it("requires xs and rejects incompatible data props", () => {
    expectTypeOf(() => {
      // @ts-expect-error xs is the required base presentation.
      makeCatalog({
        catalogDescription: "Test",
        dataShape: { label: primitives.text() },
        defaultData: { label: "Default" },
        catalog: "test",
        catalogName: "Test",
        order: 0,
        lg: { component: () => null, w: 4, h: 4 },
      });
      makeCatalog({
        catalogDescription: "Test",
        dataShape: { label: primitives.text() },
        defaultData: { label: "Default" },
        catalog: "test",
        catalogName: "Test",
        order: 0,
        xs: { component: Xs, w: 4, h: 4 },
        lg: {
          // @ts-expect-error Every presentation must accept the base presentation's data.
          component: (_props: { breakpoint: "xs" | "sm" | "lg" | "xl"; data: { label: number } }) =>
            null,
          w: 4,
          h: 4,
        },
      });
    }).toBeFunction();
  });
});

it("selects xl and otherwise inherits lg", () => {
  const base = {
    catalog: "large",
    catalogName: "Large",
    order: 0,
    xs: { component: Xs, w: 4, h: 4 },
    lg: { component: Lg, w: 4, h: 4 },
  };
  const inherited = makeCatalog({
    ...base,
    catalogDescription: "Test",
    dataShape: { label: primitives.text() },
    defaultData: { label: "Default" },
  });
  const xl = makeCatalog({
    catalogDescription: "Test",
    dataShape: { label: primitives.text() },
    defaultData: { label: "Default" },
    ...base,
    xl: { component: Xs, w: 8, h: 6 },
  });
  expect(
    renderToStaticMarkup(
      createElement(inherited.component, { breakpoint: "xl", data: { label: "a" } }),
    ),
  ).toBe("<span>lg:a:xl</span>");
  expect(
    renderToStaticMarkup(createElement(xl.component, { breakpoint: "xl", data: { label: "a" } })),
  ).toBe("<span>xs:a:xl</span>");
  expect(inherited.def.xl).toEqual({ w: 4, h: 4 });
  expect(xl.def.xl).toEqual({ w: 8, h: 6 });
});
