import { createElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, expectTypeOf, it } from "vitest";
import { makeView } from "./makeView";

function Xs(props: { breakpoint: "xs" | "sm" | "md" | "lg"; data: { label: string } }) {
  const [label] = useState(props.data.label);
  return createElement("span", null, `xs:${label}:${props.breakpoint}`);
}
function Md(props: Parameters<typeof Xs>[0]) {
  return createElement("span", null, `md:${props.data.label}:${props.breakpoint}`);
}

describe("makeView", () => {
  it("inherits omitted breakpoints and forwards props to hook-using components", () => {
    const View = makeView({ xs: Xs, md: Md });
    for (const breakpoint of ["xs", "sm", "md", "lg"] satisfies Array<"xs" | "sm" | "md" | "lg">) {
      const expected = breakpoint === "xs" || breakpoint === "sm" ? "xs" : "md";
      expect(
        renderToStaticMarkup(createElement(View, { breakpoint, data: { label: "profile" } })),
      ).toBe(`<span>${expected}:profile:${breakpoint}</span>`);
    }
    expectTypeOf<Parameters<typeof View>[0]["data"]>().toEqualTypeOf<{ label: string }>();
  });

  it("selects explicit sm and lg overrides", () => {
    const View = makeView({ xs: Xs, sm: Md, lg: Xs });
    expect(
      renderToStaticMarkup(createElement(View, { breakpoint: "md", data: { label: "a" } })),
    ).toBe("<span>md:a:md</span>");
    expect(
      renderToStaticMarkup(createElement(View, { breakpoint: "lg", data: { label: "a" } })),
    ).toBe("<span>xs:a:lg</span>");
  });

  it("requires xs and rejects incompatible data props", () => {
    // @ts-expect-error xs is the required base presentation.
    makeView({ md: Md });
    makeView({
      xs: Xs,
      // @ts-expect-error Every presentation must accept the base presentation's data.
      md: (_props: { breakpoint: "xs" | "sm" | "md" | "lg"; data: { label: number } }) => null,
    });
  });
});
