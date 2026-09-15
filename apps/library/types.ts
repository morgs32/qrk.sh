import type { ReactNode } from "react";

import type { IShape } from "@zerospin/schema";

import type { makeAppearanceForm } from "./makeAppearanceForm";
import type { IFetcherConfiguration } from "./makeFetcherConfiguration";
import type { IFormConfiguration } from "./makeFormConfiguration";

/** A catalog definition (no group scope). */
export type IBrickDef<CATALOG extends string = string> = {
  /** Resolved initial dimensions, inheriting the nearest smaller presentation. */
  xs: { w: number; h: number };
  sm: { w: number; h: number };
  lg: { w: number; h: number };
  xl: { w: number; h: number };
  /** Kebab-case catalog slug (for example `default`, `profile`, or `repo`). */
  catalogId: CATALOG;
  /** Display label for this catalog. */
  label: string;
  /** Lower sorts earlier in the drawer carousel within a group. */
  order: number;
};

export type IGroup = {
  /** Kebab-case group id, unique across the homepage group. */
  id: string;
  label: string;
  description: string;
  catalogs: Record<
    string,
    | {
        label: string;
        description: string;
        configuration?: never;
        dataShape: null;
        defaultData: null;
        def: IGroupBrickDef;
        component: IGroupBrick["component"];
      }
    | {
        label: string;
        description: string;
        configuration?: IFormConfiguration | IFetcherConfiguration;
        dataShape: IShape;
        defaultData: unknown;
        def: IGroupBrickDef;
        component: IGroupBrick["component"];
      }
  >;
};

/** Serializable group row: group + catalog, no React component. */
export type IGroupBrickDef = IBrickDef & {
  groupId: string;
  groupLabel: string;
  /** Default group data or the configured data of a placed brick. */
  data: unknown;
};

export type IBrick<
  CATALOG extends string = string,
  COMPONENT extends (props: never) => ReactNode = (props: never) => ReactNode,
> = {
  def: IBrickDef<CATALOG>;
  component: COMPONENT;
};

export type IGroupBrick = {
  def: IGroupBrickDef;
  /**
   * The group erases each catalog's concrete data type after makeCatalog has
   * checked it. Render boundaries can supply defaultData directly; components
   * without a data contract ignore the prop.
   */
  component: {
    bivarianceHack(props: {
      data?: unknown;
      appearanceOptions?: unknown;
      breakpoint: "xs" | "sm" | "lg" | "xl";
    }): ReactNode;
  }["bivarianceHack"] & { form?: ReturnType<typeof makeAppearanceForm> };
};
