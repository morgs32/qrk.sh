import type { ReactNode } from "react";

/** Select a presentation, inheriting omitted breakpoints from the nearest smaller one. */
export function makeLayout<PROPS extends { breakpoint: "xs" | "sm" | "md" | "lg" }>(presentations: {
  xs: (props: PROPS) => ReactNode;
  sm?: (props: NoInfer<PROPS>) => ReactNode;
  md?: (props: NoInfer<PROPS>) => ReactNode;
  lg?: (props: NoInfer<PROPS>) => ReactNode;
}) {
  return function Layout(props: PROPS) {
    let Presentation = presentations.xs;
    if (props.breakpoint !== "xs" && presentations.sm) Presentation = presentations.sm;
    if ((props.breakpoint === "md" || props.breakpoint === "lg") && presentations.md) {
      Presentation = presentations.md;
    }
    if (props.breakpoint === "lg" && presentations.lg) Presentation = presentations.lg;
    return <Presentation {...props} />;
  };
}
