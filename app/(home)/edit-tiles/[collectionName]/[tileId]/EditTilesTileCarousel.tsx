"use client";

import { TileCollectionCarousel } from "@/components/home/TileCollectionCarousel";
import { collectionsHash } from "@/components/home/tiles/collectionsHash";

export function EditTilesTileCarousel(props: {
  collectionName: keyof typeof collectionsHash;
}) {
  return <TileCollectionCarousel collection={collectionsHash[props.collectionName]} />;
}
