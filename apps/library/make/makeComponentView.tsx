import type { PropsWithChildren, ReactNode } from "react";

import type { BaseComponentProps } from "@json-render/react";
import { makeEffectSchema, type InferDecodedRow, type IShape } from "@zerospin/schema";
import { Schema } from "effect";

/** Bind display markup to a descriptor and adapt resolved JSON-render props once. */
export function makeComponentView<const PROPS extends IShape>(
  definition: { props: PROPS },
  view: {
    component: (props: PropsWithChildren<InferDecodedRow<PROPS>>) => ReactNode;
  },
) {
  const { props: shape } = definition;
  const { component: Component } = view;
  const decodeProps = Schema.decodeUnknownSync(makeEffectSchema(shape));

  function RegistryComponent(context: BaseComponentProps<unknown>) {
    const { props, children } = context;
    const decoded = decodeProps(props, { onExcessProperty: "error" });
    return <Component {...decoded}>{children}</Component>;
  }

  return { Component, RegistryComponent };
}
