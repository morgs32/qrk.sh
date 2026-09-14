import type { ReactNode } from "react";
import type { IBrick } from "./types";

const KEBAB_BRICK_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function makeBrick<
  const CONTENT extends string,
  const VIEW extends string,
  const COMPONENT extends (props: never) => ReactNode,
>(props: {
  content: CONTENT;
  view: VIEW;
  w: number;
  h: number;
  order: number;
  label: string;
  component: COMPONENT;
}): IBrick<CONTENT, VIEW, COMPONENT> {
  const { content, view, w, h, order, label, component } = props;

  if (!KEBAB_BRICK_NAME.test(props.content)) {
    throw new Error(
      `makeBrick: content must be kebab-case (lowercase segments separated by hyphens); got ${JSON.stringify(props.content)}`,
    );
  }
  if (!KEBAB_BRICK_NAME.test(props.view)) {
    throw new Error(
      `makeBrick: view must be kebab-case (lowercase segments separated by hyphens); got ${JSON.stringify(props.view)}`,
    );
  }
  return {
    def: {
      content,
      view,
      w,
      h,
      order,
      label,
    },
    component,
  };
}
