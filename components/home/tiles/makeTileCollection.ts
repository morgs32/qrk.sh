import type { ICollectionTile, ITile } from "./types";

type TileNameUnion<Tiles extends readonly ITile[]> = Tiles[number] extends ITile
  ? Tiles[number]["def"]["name"]
  : never;

export function makeTileCollection<const Tiles extends readonly ITile[]>(props: {
  collectionId: string;
  collectionLabel: string;
  tiles: Tiles;
  /** Must match `def.name` of one of the tiles in `tiles`. */
  popular: TileNameUnion<Tiles>;
}): ICollectionTile[] {
  const { collectionId, collectionLabel, tiles, popular } = props;

  if (!tiles.some((tile) => tile.def.name === popular)) {
    throw new Error(
      `makeTileCollection: popular ${JSON.stringify(popular)} is not among tile names: ${tiles.map((t) => t.def.name).join(", ")}`,
    );
  }

  return tiles.map((tile) => ({
    def: {
      name: tile.def.name,
      w: tile.def.w,
      h: tile.def.h,
      label: tile.def.label ?? collectionLabel,
      collectionId,
      collectionLabel,
      popular,
    },
    component: tile.component,
  }));
}
