import { notFound } from "next/navigation";
import { Either, Schema } from "effect";
import { TileCollectionCarousel } from "@/components/home/TileCollectionCarousel";
import { collectionsHash } from "@/components/home/tiles/collectionsHash";

const collectionNames = Object.keys(collectionsHash) as Array<keyof typeof collectionsHash>;

const EditTilesRouteParamsSchema = Schema.Struct({
  collectionName: Schema.Union(...collectionNames.map((name) => Schema.Literal(name))),
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

  return (
    <div className="fixed top-16 left-0 z-20 flex h-[calc(100vh-4rem)] w-full min-w-0 flex-col overflow-y-auto border-r border-border bg-background md:w-1/2">
      <TileCollectionCarousel collection={collectionsHash[collectionName]} />
    </div>
  );
}
