import { notFound } from "next/navigation";
import { Either, Schema } from "effect";
import { TileCarousel } from "@/components/home/TileCarousel";
import type { ICollectionTile } from "@/components/home/tiles/types";
import { collectionsHash } from "@/components/home/tiles/collectionsHash";

/** Self-map for `Schema.Enums` (each key maps to its string value). */
const editTilesCollectionNameEnums = Object.fromEntries(
  (Object.keys(collectionsHash) as (keyof typeof collectionsHash)[]).map((k) => [k, k]),
) as { [K in keyof typeof collectionsHash]: K };

const EditTilesCollectionNameSchema = Schema.Enums(editTilesCollectionNameEnums);

const EditTilesRouteParamsSchema = Schema.Struct({
  collectionName: EditTilesCollectionNameSchema,
  tileId: Schema.String,
});

export default async function EditTilesTilePage({
  params,
}: {
  params: Promise<{ collectionName: string; tileId: string }>;
}) {
  const rawParams = await params;
  const decoded = Schema.decodeUnknownEither(EditTilesRouteParamsSchema)(rawParams);
  if (Either.isLeft(decoded)) {
    notFound();
  }
  const { collectionName } = decoded.right;
  const entry = collectionsHash[collectionName];

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
