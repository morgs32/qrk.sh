import type { ComponentType } from "react";

/** Variant-only fields (no collection scope). */
export type ITileDef = {
  w: number;
  h: number;
  /** Kebab-case slug for this variant (e.g. `2x2`, `work-row`). */
  name: string;
  /** Display label for this variant; collection merges default from `collectionLabel` when omitted. */
  label: string;
  /** Lower sorts earlier in the drawer carousel. */
  order: number;
};

export type ICollection<TILES extends Record<string, ITile> = Record<string, ITile>> = {
  collectionName: string;
  collectionLabel: string;
  tiles: {
    [K in keyof TILES]: ICollectionTile<TILES[K]>;
  };
};

/** Serializable catalog row: collection + variant, no React component. */
export type ICollectionTileDef<TILE_DEF extends ITileDef> = TILE_DEF & {
  collectionName: string;
  collectionLabel: string;
  /** Resolved label after collection merge (always set on catalog tiles). */
  label: string;
};

export type ITile = {
  def: ITileDef;
  component: ComponentType;
};

export type ICollectionTile<TILE extends ITile = ITile> = {
  def: ICollectionTileDef<TILE["def"]>;
  component: TILE["component"];
};
