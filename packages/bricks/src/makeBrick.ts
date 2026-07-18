import type { ReactNode } from "react";
import type { IBrick } from "./types";

const KEBAB_BRICK_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function makeBrick<
  const VARIANT extends string,
  const SIZE extends string,
  const COMPONENT extends (props: never) => ReactNode,
>(props: {
  variant: VARIANT;
  size: SIZE;
  w: number;
  h: number;
  order: number;
  label: string;
  component: COMPONENT;
}): IBrick<VARIANT, SIZE, COMPONENT> {
  const { variant, size, w, h, order, label, component } = props;

  if (!KEBAB_BRICK_NAME.test(props.variant)) {
    throw new Error(
      `makeBrick: variant must be kebab-case (lowercase segments separated by hyphens); got ${JSON.stringify(props.variant)}`,
    );
  }
  if (!KEBAB_BRICK_NAME.test(props.size)) {
    throw new Error(
      `makeBrick: size must be kebab-case (lowercase segments separated by hyphens); got ${JSON.stringify(props.size)}`,
    );
  }
  return {
    def: {
      variant,
      size,
      w,
      h,
      order,
      label,
    },
    component,
  };
}
