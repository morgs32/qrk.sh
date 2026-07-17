import { collectionsHash } from "@qrk.sh/bricks";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { useGridStore } from "../useGridStore";

export const Route = createFileRoute("/collections/$collectionName/")({
  component: CollectionCatalog,
});

function CollectionCatalog() {
  const { collectionName } = Route.useParams();
  const setActiveBrickDrag = useGridStore((state) => state.setActiveBrickDrag);
  const collection = Object.values(collectionsHash).find(
    (candidate) => candidate.collectionName === collectionName,
  );

  if (!collection) {
    throw notFound();
  }

  const bricks = Object.values(collection.bricks);

  return (
    <>
      <div className="px-6 pt-6">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-zinc-600">
          <ArrowLeft aria-hidden className="size-4" />
          <span>All collections</span>
        </Link>
        <h1 className="mb-1 mt-5 text-4xl font-semibold tracking-tight">
          {collection.collectionLabel}
        </h1>
        <p className="mt-0 font-mono text-sm text-zinc-500">{collection.collectionName}</p>
      </div>
      <div className="mt-8 flex flex-col gap-10">
        {bricks.map((brick) => {
          const BrickComponent = brick.component;

          return (
            <section key={brick.def.name}>
              <h2 className="m-0 px-6 text-2xl font-semibold">{brick.def.label}</h2>
              <div className="mt-6 overflow-auto">
                <div
                  className="qrk-bricks cursor-grab overflow-hidden active:cursor-grabbing"
                  data-brick-full-size={`${brick.def.collectionName}/${brick.def.name}`}
                  draggable
                  onDragStart={(event) => {
                    setActiveBrickDrag(brick.def);
                    event.dataTransfer.effectAllowed = "copy";
                    event.dataTransfer.setData("text/plain", brick.def.name);
                  }}
                  onDragEnd={() => {
                    setActiveBrickDrag(null);
                  }}
                  style={{
                    width: `${(brick.def.w / 8) * 100}%`,
                    aspectRatio: `${brick.def.w} / ${brick.def.h}`,
                  }}
                >
                  <BrickComponent />
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
