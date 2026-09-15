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
  lg?: (props: NoInfer<PROPS>) => ReactNode;
  xl?: (props: NoInfer<PROPS>) => ReactNode;
}) {
  const { id, label, w, h, order, ...presentations } = props;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`makeView: id must be kebab-case; got ${JSON.stringify(id)}`);
  }

  function View(
    props: NoInfer<PROPS> & { breakpoint: "xs" | "sm" | "lg" | "xl"; viewOptions?: unknown },
  ) {
    let Presentation = presentations.xs;
    if (props.breakpoint !== "xs" && presentations.sm) Presentation = presentations.sm;
    if ((props.breakpoint === "lg" || props.breakpoint === "xl") && presentations.lg) Presentation = presentations.lg;
    if (props.breakpoint === "xl" && presentations.xl) Presentation = presentations.xl;
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
