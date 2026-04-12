import type { ComponentType } from "react";

/** Variant-only fields (no collection scope). */
export type ITileVariantDef = {
  w: number;
  h: number;
  /** Kebab-case slug for this variant (e.g. `2x2`, `work-row`). */
  name: string;
  /** Display label for this variant; collection merges default from `collectionLabel` when omitted. */
  label?: string;
  /** Lower sorts earlier in the drawer carousel. */
  order: number;
};

/** Serializable catalog row: collection + variant, no React component. */
export type ICollectionTileDef = ITileVariantDef & {
  collectionName: string;
  collectionLabel: string;
  /** Resolved label after collection merge (always set on catalog tiles). */
  label: string;
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
 * Stable id matching legacy `typeId` rules: 4×4 primary slot uses bare `collectionName`,
 * other variants use `${collectionName}--${w}x${h}`.
 */
export function catalogKey(def: ICollectionTileDef): string {
  if (def.w === 4 && def.h === 4) {
    return def.collectionName;
  }
  return `${def.collectionName}--${def.w}x${def.h}`;
}

export function tileDefsEqual(a: ICollectionTileDef, b: ICollectionTileDef): boolean {
  return (
    a.collectionName === b.collectionName &&
    a.collectionLabel === b.collectionLabel &&
    a.name === b.name &&
    a.w === b.w &&
    a.h === b.h &&
    a.label === b.label
  );
}
