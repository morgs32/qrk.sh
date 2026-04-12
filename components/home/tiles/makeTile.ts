import type { ComponentType } from "react";
import type { ITile } from "./types";

const KEBAB_TILE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function makeTile<N extends string>(props: {
  name: N;
  w: number;
  h: number;
  order: number;
  label: string;
  component: ComponentType;
}): ITile {
  const { name, w, h, order, label, component } = props;

  if (!KEBAB_TILE_NAME.test(props.name)) {
    throw new Error(
      `makeTile: name must be kebab-case (lowercase segments separated by hyphens); got ${JSON.stringify(props.name)}`,
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
