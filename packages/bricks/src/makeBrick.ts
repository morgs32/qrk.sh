import type { ReactNode } from "react";
import type { IBrick } from "./types";

const KEBAB_BRICK_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function makeBrick<
  const VARIANT extends string,
  const LAYOUT extends string,
  const COMPONENT extends (props: never) => ReactNode,
>(props: {
  variant: VARIANT;
  layout: LAYOUT;
  w: number;
  h: number;
  order: number;
  label: string;
  component: COMPONENT;
}): IBrick<VARIANT, LAYOUT, COMPONENT> {
  const { variant, layout, w, h, order, label, component } = props;

  if (!KEBAB_BRICK_NAME.test(props.variant)) {
    throw new Error(
      `makeBrick: variant must be kebab-case (lowercase segments separated by hyphens); got ${JSON.stringify(props.variant)}`,
    );
  }
  if (!KEBAB_BRICK_NAME.test(props.layout)) {
    throw new Error(
      `makeBrick: layout must be kebab-case (lowercase segments separated by hyphens); got ${JSON.stringify(props.layout)}`,
    );
  }
  return {
    def: {
      variant,
      layout,
      w,
      h,
      order,
      label,
    },
    component,
  };
}
