import type { ComponentType } from "react";
import type { ITile } from "./types";

export function makeTile(props: {
  w: number;
  h: number;
  label?: string;
  component: ComponentType;
}): ITile {
  return {
    def: {
      w: props.w,
      h: props.h,
      ...(props.label !== undefined ? { label: props.label } : {}),
    },
    component: props.component,
  };
}
