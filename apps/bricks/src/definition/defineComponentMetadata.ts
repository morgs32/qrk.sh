import type { IShape } from "@zerospin/shapes";

/** Describe an allowed json-render component and the shape of its props; contains no React implementation. */
export function defineComponentMetadata<
  const TYPE extends string,
  const PROPS_SHAPE extends IShape,
>(props: { type: TYPE; propsShape: PROPS_SHAPE; slots?: readonly string[]; description?: string }) {
  const { type, propsShape, slots, description } = props;
  return {
    type,
    propsShape,
    ...(slots === undefined ? {} : { slots }),
    ...(description === undefined ? {} : { description }),
  };
}
