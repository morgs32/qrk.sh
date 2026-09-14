import type { ReactNode } from "react";
import type { makeViewForm } from "./makeViewForm";

/** Select a presentation, inheriting omitted breakpoints from the nearest smaller one. */
export function makeView<
  PROPS extends { breakpoint: "xs" | "sm" | "md" | "lg"; viewOptions?: unknown },
>(presentations: {
  form?: ReturnType<typeof makeViewForm>;
  xs: (props: PROPS) => ReactNode;
  sm?: (props: NoInfer<PROPS>) => ReactNode;
  md?: (props: NoInfer<PROPS>) => ReactNode;
  lg?: (props: NoInfer<PROPS>) => ReactNode;
}) {
  function View(props: PROPS) {
    let Presentation = presentations.xs;
    if (props.breakpoint !== "xs" && presentations.sm) Presentation = presentations.sm;
    if ((props.breakpoint === "md" || props.breakpoint === "lg") && presentations.md) {
      Presentation = presentations.md;
    }
    if (props.breakpoint === "lg" && presentations.lg) Presentation = presentations.lg;
    return (
      <Presentation
        {...props}
        viewOptions={props.viewOptions ?? presentations.form?.defaultValue ?? {}}
      />
    );
  }
  View.form = presentations.form;
  return View;
}
