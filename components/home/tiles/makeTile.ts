import type { ComponentType } from "react";
import type { ITile } from "./types";

const KEBAB_TILE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function makeTile<N extends string>(props: {
  name: N;
  w: number;
  h: number;
  order: number;
  label?: string;
  component: ComponentType;
}): ITile & { def: { name: N } } {
  if (!KEBAB_TILE_NAME.test(props.name)) {
    throw new Error(
      `makeTile: name must be kebab-case (lowercase segments separated by hyphens); got ${JSON.stringify(props.name)}`,
    );
  }
  return {
    def: {
      name: props.name,
      w: props.w,
      h: props.h,
      order: props.order,
      ...(props.label !== undefined ? { label: props.label } : {}),
    },
    component: props.component,
  };
}
