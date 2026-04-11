import type { ICollectionTile, ITile } from "./types";

export function makeTileCollection(props: {
  collectionId: string;
  collectionLabel: string;
  tiles: ITile[];
}): ICollectionTile[] {
  const { collectionId, collectionLabel, tiles } = props;
  return tiles.map((tile) => ({
    def: {
      w: tile.def.w,
      h: tile.def.h,
      label: tile.def.label ?? collectionLabel,
      collectionId,
      collectionLabel,
    },
    component: tile.component,
  }));
}
