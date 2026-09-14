import type { IFormConfiguration } from "./makeFormConfiguration";
import type { IFetcherConfiguration } from "./makeFetcherConfiguration";
import type { IShape } from "@zerospin/schema";
import type { ReactNode } from "react";

/** A layout within one content variant (no collection scope). */
export type IBrickDef<VARIANT extends string = string, LAYOUT extends string = string> = {
  w: number;
  h: number;
  /** Kebab-case content variant slug (for example `default`, `profile`, or `repo`). */
  variant: VARIANT;
  /** Kebab-case layout slug (for example `2x2`, `4x4`, or `8x2`). */
  layout: LAYOUT;
  /** Display label for this layout. */
  label: string;
  /** Lower sorts earlier in the drawer carousel within a collection. */
  order: number;
};

export type ICollection = {
  /** Kebab-case collection id, unique across the homepage catalog. */
  collectionName: string;
  collectionLabel: string;
  collectionDescription: string;
  variants: Record<
    string,
    | {
        variantName: string;
        variantDescription: string;
        configuration?: IFetcherConfiguration & { fetcher?: never };
        dataShape: null;
        defaultData: null;
        layouts: Record<string, ICollectionBrick>;
      }
    | {
        variantName: string;
        variantDescription: string;
        configuration?:
          | IFormConfiguration
          | (IFetcherConfiguration & {
              fetcher: NonNullable<IFetcherConfiguration["fetcher"]>;
            });
        dataShape: IShape;
        defaultData: unknown;
        layouts: Record<string, ICollectionBrick>;
      }
  >;
};

/** Serializable catalog row: collection + content variant + layout, no React component. */
export type ICollectionBrickDef = IBrickDef & {
  collectionName: string;
  collectionLabel: string;
  /** Default catalog data or the configured data of a placed brick. */
  data: unknown;
};

export type IBrick<
  VARIANT extends string = string,
  LAYOUT extends string = string,
  COMPONENT extends (props: never) => ReactNode = (props: never) => ReactNode,
> = {
  def: IBrickDef<VARIANT, LAYOUT>;
  component: COMPONENT;
};

export type ICollectionBrick = {
  def: ICollectionBrickDef;
  /**
   * The collection erases each variant's concrete data type after makeVariant has
   * checked it. Render boundaries can supply defaultData directly; components
   * without a data contract ignore the prop.
   */
  component: { bivarianceHack(props: { data?: unknown }): ReactNode }["bivarianceHack"];
};
