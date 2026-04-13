import { notFound } from "next/navigation";
import { TileCarousel } from "@/components/home/TileCarousel";
import type { ICollectionTile } from "@/components/home/tiles/types";
import { collectionsHash } from "../../../../../components/home/tiles/collectionsHash";

export default async function EditTilesTilePage({
  params,
}: {
  params: Promise<{ collectionName: string; tileId: string }>;
}) {
  const { collectionName } = await params;

  const entry = collectionsHash[collectionName];
  if (!entry) {
    notFound();
  }

  const tiles: ICollectionTile[] = Object.values(entry.tiles).sort(
    (a, b) => a.def.order - b.def.order,
  );
  const collectionLabel = tiles[0]!.def.collectionLabel;

  return (
    <div className="fixed top-16 left-0 z-20 flex h-[calc(100vh-4rem)] w-full min-w-0 flex-col overflow-y-auto border-r border-border bg-background md:w-1/2">
      <TileCarousel collectionLabel={collectionLabel} tiles={tiles} />
    </div>
  );
}
