import type { ComponentType } from "react";
import type { IBrick } from "./types";

const KEBAB_BRICK_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function makeBrick<N extends string>(props: {
  name: N;
  w: number;
  h: number;
  order: number;
  label: string;
  component: ComponentType;
}): IBrick {
  const { name, w, h, order, label, component } = props;

  if (!KEBAB_BRICK_NAME.test(props.name)) {
    throw new Error(
      `makeBrick: name must be kebab-case (lowercase segments separated by hyphens); got ${JSON.stringify(props.name)}`,
    );
  }
  return {
    def: {
      name,
      w,
      h,
      order,
      label,
    },
    component,
  };
}
