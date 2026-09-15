import type { ReactNode } from "react";

import type { IShape } from "@zerospin/schema";

import type { makeAppearanceForm } from "./makeAppearanceForm";
import type { IFetcherConfiguration } from "./makeFetcherConfiguration";
import type { IFormConfiguration } from "./makeFormConfiguration";

/** A registry definition (no catalog scope). */
export type IBrickDef<REGISTRY extends string = string> = {
  /** Resolved initial dimensions, inheriting the nearest smaller presentation. */
  xs: { w: number; h: number };
  sm: { w: number; h: number };
  lg: { w: number; h: number };
  xl: { w: number; h: number };
  /** Kebab-case registry slug (for example `default`, `profile`, or `repo`). */
  registry: REGISTRY;
  /** Display label for this registry. */
  label: string;
  /** Lower sorts earlier in the drawer carousel within a catalog. */
  order: number;
};

export type ICatalog = {
  /** Kebab-case catalog id, unique across the homepage catalog. */
  catalogName: string;
  catalogLabel: string;
  catalogDescription: string;
  registries: Record<
    string,
    | {
        registryName: string;
        registryDescription: string;
        configuration?: never;
        dataShape: null;
        defaultData: null;
        def: ICatalogBrickDef;
        component: ICatalogBrick["component"];
      }
    | {
        registryName: string;
        registryDescription: string;
        configuration?: IFormConfiguration | IFetcherConfiguration;
        dataShape: IShape;
        defaultData: unknown;
        def: ICatalogBrickDef;
        component: ICatalogBrick["component"];
      }
  >;
};

/** Serializable catalog row: catalog + registry, no React component. */
export type ICatalogBrickDef = IBrickDef & {
  catalogName: string;
  catalogLabel: string;
  /** Default catalog data or the configured data of a placed brick. */
  data: unknown;
};

export type IBrick<
  REGISTRY extends string = string,
  COMPONENT extends (props: never) => ReactNode = (props: never) => ReactNode,
> = {
  def: IBrickDef<REGISTRY>;
  component: COMPONENT;
};

export type ICatalogBrick = {
  def: ICatalogBrickDef;
  /**
   * The catalog erases each registry's concrete data type after makeRegistry has
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
