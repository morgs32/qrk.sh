import type { ComponentType } from "react";

/** Variant-only fields (no collection scope). */
export type ITileVariantDef = {
  w: number;
  h: number;
  /** Kebab-case slug for this variant (e.g. `1x1`, `work-row`). */
  name: string;
  /** Display label for this variant; collection merges default from `collectionLabel` when omitted. */
  label?: string;
};

/** Serializable catalog row: collection + variant, no React component. */
export type ICollectionTileDef = ITileVariantDef & {
  collectionId: string;
  collectionLabel: string;
  /** Resolved label after collection merge (always set on catalog tiles). */
  label: string;
  /** Same as `def.name` on one variant in the collection; that variant sorts first in the drawer carousel. */
  popular: string;
};

export type ITile = {
  def: ITileVariantDef;
  component: ComponentType;
};

export type ICollectionTile = {
  def: ICollectionTileDef;
  component: ComponentType;
};

/**
 * Stable id matching legacy `typeId` rules: 2×2 primary slot uses bare `collectionId`,
 * other variants use `${collectionId}--${w}x${h}`.
 */
export function catalogKey(def: ICollectionTileDef): string {
  if (def.w === 2 && def.h === 2) {
    return def.collectionId;
  }
  return `${def.collectionId}--${def.w}x${def.h}`;
}

export function tileDefsEqual(a: ICollectionTileDef, b: ICollectionTileDef): boolean {
  return (
    a.collectionId === b.collectionId &&
    a.collectionLabel === b.collectionLabel &&
    a.popular === b.popular &&
    a.name === b.name &&
    a.w === b.w &&
    a.h === b.h &&
    a.label === b.label
  );
}
