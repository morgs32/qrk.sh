import type { ReactNode } from "react";
import type { makeViewForm } from "./makeViewForm";

/** Define a view, inheriting omitted breakpoints from the nearest smaller presentation. */
export function makeView<const ID extends string, PROPS extends object>(props: {
  id: ID;
  label: string;
  w: number;
  h: number;
  order: number;
  form?: ReturnType<typeof makeViewForm>;
  xs: (props: PROPS) => ReactNode;
  sm?: (props: NoInfer<PROPS>) => ReactNode;
  md?: (props: NoInfer<PROPS>) => ReactNode;
  lg?: (props: NoInfer<PROPS>) => ReactNode;
  xl?: (props: NoInfer<PROPS>) => ReactNode;
  "2xl"?: (props: NoInfer<PROPS>) => ReactNode;
}) {
  const { id, label, w, h, order, ...presentations } = props;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`makeView: id must be kebab-case; got ${JSON.stringify(id)}`);
  }

  function View(
    props: NoInfer<PROPS> & { breakpoint: "xs" | "sm" | "md" | "lg" | "xl" | "2xl"; viewOptions?: unknown },
  ) {
    let Presentation = presentations.xs;
    if (props.breakpoint !== "xs" && presentations.sm) Presentation = presentations.sm;
    if ((props.breakpoint === "md" || props.breakpoint === "lg" || props.breakpoint === "xl" || props.breakpoint === "2xl") && presentations.md) {
      Presentation = presentations.md;
    }
    if ((props.breakpoint === "lg" || props.breakpoint === "xl" || props.breakpoint === "2xl") && presentations.lg) Presentation = presentations.lg;
    if ((props.breakpoint === "xl" || props.breakpoint === "2xl") && presentations.xl) Presentation = presentations.xl;
    if (props.breakpoint === "2xl" && presentations["2xl"]) Presentation = presentations["2xl"];
    return (
      <Presentation
        {...props}
        viewOptions={props.viewOptions ?? presentations.form?.defaultValue ?? {}}
      />
    );
  }
  View.form = presentations.form;
  return { id, label, w, h, order, component: View };
}
