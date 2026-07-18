import type { IShape } from "@zerospin/core/models/types";
import type { ComponentType } from "react";
import type { ScraperApi } from "scraper/ScraperApi";
import type { IJsonValue, IRpcEither } from "scraper/types";

/** A size within one content variant (no collection scope). */
export type IBrickDef<VARIANT extends string = string, SIZE extends string = string> = {
  w: number;
  h: number;
  /** Kebab-case content variant slug (for example `default`, `profile`, or `repo`). */
  variant: VARIANT;
  /** Kebab-case size slug (for example `2x2`, `4x4`, or `8x2`). */
  size: SIZE;
  /** Display label for this size. */
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
        variantDescription: string;
        payload?: never;
        getData?: never;
        sizes: Record<string, ICollectionBrick>;
      }
    | {
        variantDescription: string;
        payload: IShape;
        getData: (props: { api: ScraperApi; payload: unknown }) => Promise<IRpcEither<IJsonValue>>;
        sizes: Record<string, ICollectionBrick>;
      }
  >;
};

/** Serializable catalog row: collection + content variant + size, no React component. */
export type ICollectionBrickDef = IBrickDef & {
  collectionName: string;
  collectionLabel: string;
};

export type IBrick<VARIANT extends string = string, SIZE extends string = string> = {
  def: IBrickDef<VARIANT, SIZE>;
  component: ComponentType;
};

export type ICollectionBrick = {
  def: ICollectionBrickDef;
  component: ComponentType;
};
