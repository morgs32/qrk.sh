import type { PropsWithChildren, ReactNode } from "react";

import type { BaseComponentProps } from "@json-render/react";
import { makeEffectSchema, type IInferDecodedRow, type IShape } from "@zerospin/shapes";
import { Schema } from "effect";

/** Bind display markup to component metadata and adapt resolved JSON-render props once. */
export function makeComponentView<const PROPS_SHAPE extends IShape>(
  componentMetadata: { propsShape: PROPS_SHAPE },
  view: {
    component: (props: PropsWithChildren<IInferDecodedRow<PROPS_SHAPE>>) => ReactNode;
  },
) {
  const { propsShape } = componentMetadata;
  const { component: Component } = view;
  const decodeProps = Schema.decodeUnknownSync(Schema.toType(makeEffectSchema(propsShape)));

  function RegistryComponent(context: BaseComponentProps<unknown>) {
    const { props, children } = context;
    const decoded = decodeProps(props, { onExcessProperty: "error" });
    return <Component {...decoded}>{children}</Component>;
  }

  return { Component, RegistryComponent };
}
