import type { CSSProperties, ReactNode } from "react";

import { BrickBody } from "../../components/brick/BrickBody";
import { BrickFooter } from "../../components/brick/BrickFooter";
import { BrickShell } from "../../components/brick/BrickShell";
import { Column } from "../../components/Column";
import { Row } from "../../components/Row";

function gapFromProps(props: Record<string, unknown>): 2 | 4 {
  return props.gap === 4 ? 4 : 2;
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
  BrickShell: ({ children }: { children?: ReactNode }) => <BrickShell>{children}</BrickShell>,
  BrickBody: ({ children }: { children?: ReactNode }) => <BrickBody>{children}</BrickBody>,
  BrickFooter: ({ children }: { children?: ReactNode }) => <BrickFooter>{children}</BrickFooter>,
  Column: ({
    children,
    props,
  }: {
    children?: ReactNode;
    props: Record<string, unknown>;
  }) => (
    <Column
      gap={gapFromProps(props)}
      justifyContent={justifyContentProp(props.justifyContent)}
      alignItems={alignItemsProp(props.alignItems)}
      flexWrap={flexWrapProp(props.flexWrap)}
    >
      {children}
    </Column>
  ),
  Row: ({
    children,
    props,
  }: {
    children?: ReactNode;
    props: Record<string, unknown>;
  }) => (
    <Row
      className={stringProp(props.className)}
      gap={gapFromProps(props)}
      justifyContent={justifyContentProp(props.justifyContent)}
      alignItems={alignItemsProp(props.alignItems)}
      flexWrap={flexWrapProp(props.flexWrap)}
    >
      {children}
    </Row>
  ),
};
