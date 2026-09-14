import type { makeViewForm } from "./makeViewForm";
import type { IFormConfiguration } from "./makeFormConfiguration";
import type { IFetcherConfiguration } from "./makeFetcherConfiguration";
import type { IShape } from "@zerospin/schema";
import type { ReactNode } from "react";

/** A view within one content definition (no collection scope). */
export type IBrickDef<CONTENT extends string = string, VIEW extends string = string> = {
  w: number;
  h: number;
  /** Kebab-case content definition slug (for example `default`, `profile`, or `repo`). */
  content: CONTENT;
  /** Kebab-case view slug (for example `2x2`, `4x4`, or `8x2`). */
  view: VIEW;
  /** Display label for this view. */
  label: string;
  /** Lower sorts earlier in the drawer carousel within a collection. */
  order: number;
};

export type ICollection = {
  /** Kebab-case collection id, unique across the homepage catalog. */
  collectionName: string;
  collectionLabel: string;
  collectionDescription: string;
  contents: Record<
    string,
    | {
        contentName: string;
        contentDescription: string;
        configuration?: never;
        dataShape: null;
        defaultData: null;
        views: Record<string, ICollectionBrick>;
      }
    | {
        contentName: string;
        contentDescription: string;
        configuration?: IFormConfiguration | IFetcherConfiguration;
        dataShape: IShape;
        defaultData: unknown;
        views: Record<string, ICollectionBrick>;
      }
  >;
};

/** Serializable catalog row: collection + content definition + view, no React component. */
export type ICollectionBrickDef = IBrickDef & {
  collectionName: string;
  collectionLabel: string;
  /** Default catalog data or the configured data of a placed brick. */
  data: unknown;
};

export type IBrick<
  CONTENT extends string = string,
  VIEW extends string = string,
  COMPONENT extends (props: never) => ReactNode = (props: never) => ReactNode,
> = {
  def: IBrickDef<CONTENT, VIEW>;
  component: COMPONENT;
};

export type ICollectionBrick = {
  def: ICollectionBrickDef;
  /**
   * The collection erases each content's concrete data type after makeContent has
   * checked it. Render boundaries can supply defaultData directly; components
   * without a data contract ignore the prop.
   */
  component: {
    bivarianceHack(props: {
      data?: unknown;
      viewOptions?: unknown;
      breakpoint: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
    }): ReactNode;
  }["bivarianceHack"] & { form?: ReturnType<typeof makeViewForm> };
};
