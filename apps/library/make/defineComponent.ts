import type { IShape } from "@zerospin/schema";

/** Authored json-render component vocab: primitives props; catalog zod via defineModule. */
export function defineComponent<
  const TYPE extends string,
  const PROPS extends IShape,
>(props: {
  type: TYPE;
  props: PROPS;
  slots?: readonly string[];
  description?: string;
}) {
  return {
    type: props.type,
    props: props.props,
    ...(props.slots === undefined ? {} : { slots: props.slots }),
    ...(props.description === undefined ? {} : { description: props.description }),
  };
}
