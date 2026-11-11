import type { CSSProperties, ReactNode } from "react";

import { BrickBody } from "./BrickBody";
import { BrickFooter } from "./BrickFooter";
import { BrickShell } from "./BrickShell";
import { Column } from "./Column";
import { Row } from "./Row";

function gapFromProps(props: Record<string, unknown>): 2 | 4 {
  const { gap } = props;
  return gap === 4 ? 4 : 2;
}

function stringProp(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function justifyContentProp(value: unknown): CSSProperties["justifyContent"] | undefined {
  switch (value) {
    case "flex-start":
    case "flex-end":
    case "center":
    case "space-between":
    case "space-around":
    case "space-evenly":
      return value;
    default:
      return undefined;
  }
}

function alignItemsProp(value: unknown): CSSProperties["alignItems"] | undefined {
  switch (value) {
    case "flex-start":
    case "flex-end":
    case "center":
    case "stretch":
    case "baseline":
      return value;
    default:
      return undefined;
  }
}

function flexWrapProp(value: unknown): CSSProperties["flexWrap"] | undefined {
  switch (value) {
    case "nowrap":
    case "wrap":
    case "wrap-reverse":
      return value;
    default:
      return undefined;
  }
}

/**
 * Shared layout registry entries.
 * Props are Record-typed so spreading into defineRegistry stays assignable
 * across module catalogs (contextual typing does not flow through spreads).
 */
export const layoutRegistryComponents = {
  BrickShell(props: { children?: ReactNode }) {
    const { children } = props;
    return <BrickShell>{children}</BrickShell>;
  },
  BrickBody(props: { children?: ReactNode }) {
    const { children } = props;
    return <BrickBody>{children}</BrickBody>;
  },
  BrickFooter(props: { children?: ReactNode }) {
    const { children } = props;
    return <BrickFooter>{children}</BrickFooter>;
  },
  Column(context: { children?: ReactNode; props: Record<string, unknown> }) {
    const { children, props } = context;
    return (
      <Column
        gap={gapFromProps(props)}
        justifyContent={justifyContentProp(props.justifyContent)}
        alignItems={alignItemsProp(props.alignItems)}
        flexWrap={flexWrapProp(props.flexWrap)}
      >
        {children}
      </Column>
    );
  },
  Row(context: { children?: ReactNode; props: Record<string, unknown> }) {
    const { children, props } = context;
    return (
      <Row
        className={stringProp(props.className)}
        gap={gapFromProps(props)}
        justifyContent={justifyContentProp(props.justifyContent)}
        alignItems={alignItemsProp(props.alignItems)}
        flexWrap={flexWrapProp(props.flexWrap)}
      >
        {children}
      </Row>
    );
  },
};
