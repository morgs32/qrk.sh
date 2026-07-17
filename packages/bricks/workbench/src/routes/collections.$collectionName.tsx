import { useRef, useState } from "react";
import { collectionsHash, type ICollectionBrick } from "@qrk.sh/bricks";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import GridLayout, { type Layout, useContainerWidth, verticalCompactor } from "react-grid-layout";

export const Route = createFileRoute("/collections/$collectionName")({
  loader: ({ params }) => {
    const collection = Object.values(collectionsHash).find(
      (candidate) => candidate.collectionName === params.collectionName,
    );

    if (!collection) {
      throw notFound();
    }

    return collection.collectionName;
  },
  component: CollectionPage,
  notFoundComponent: CollectionNotFound,
});

function CollectionPage() {
  const collectionName = Route.useLoaderData();
  const { containerRef, mounted, width } = useContainerWidth();
  const activeBrickNameRef = useRef<string | null>(null);
  const [gridLayout, setGridLayout] = useState<Layout>([
    { i: "fixture-1", x: 0, y: 0, w: 2, h: 2 },
    { i: "fixture-2", x: 2, y: 0, w: 2, h: 2 },
    { i: "fixture-3", x: 4, y: 0, w: 2, h: 2 },
    { i: "fixture-4", x: 6, y: 0, w: 2, h: 2 },
  ]);
  const [gridBricks, setGridBricks] = useState(new Map<string, ICollectionBrick>());
  const collection = Object.values(collectionsHash).find(
    (candidate) => candidate.collectionName === collectionName,
  );

  if (!collection) {
    throw notFound();
  }

  const bricks = Object.values(collection.bricks);
  const gridWidth = Math.max(width, 1);
  const rowHeight = gridWidth / 8;

  return (
    <main className="min-h-screen">
      <div className="grid min-h-screen md:grid-cols-2">
        <section className="border-b border-zinc-300 pb-6 md:border-b-0 md:border-r md:pb-0">
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
                        activeBrickNameRef.current = brick.def.name;
                        event.dataTransfer.effectAllowed = "copy";
                        event.dataTransfer.setData("text/plain", brick.def.name);
                      }}
                      onDragEnd={() => {
                        activeBrickNameRef.current = null;
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
        </section>

        <section ref={containerRef} aria-label="Brick grid" className="min-h-screen bg-white">
          {mounted && (
            <GridLayout
              width={gridWidth}
              layout={gridLayout}
              autoSize
              className="grid-layout"
              compactor={verticalCompactor}
              gridConfig={{
                cols: 8,
                rowHeight,
                margin: [0, 0],
                containerPadding: [0, 0],
                maxRows: Number.POSITIVE_INFINITY,
              }}
              dragConfig={{ enabled: true, bounded: true, threshold: 3 }}
              resizeConfig={{ enabled: false, handles: [] }}
              dropConfig={{
                enabled: true,
                defaultItem: { w: 2, h: 2 },
                onDragOver: (event) => {
                  const brickName =
                    event.dataTransfer?.getData("text/plain") || activeBrickNameRef.current;
                  const brick = Object.values(collection.bricks).find(
                    (candidate) => candidate.def.name === brickName,
                  );

                  if (!brick) {
                    return false;
                  }

                  return { w: brick.def.w, h: brick.def.h };
                },
              }}
              onDrop={(nextLayout, item, event) => {
                if (!item) {
                  return;
                }

                const brickName =
                  (event instanceof DragEvent ? event.dataTransfer?.getData("text/plain") : "") ||
                  activeBrickNameRef.current;
                const brick = Object.values(collection.bricks).find(
                  (candidate) => candidate.def.name === brickName,
                );

                if (!brick) {
                  return;
                }

                const gridBrickId = crypto.randomUUID();
                setGridLayout(
                  nextLayout.map((layoutItem) => {
                    if (layoutItem.i !== item.i) {
                      return layoutItem;
                    }

                    return {
                      ...layoutItem,
                      i: gridBrickId,
                      w: brick.def.w,
                      h: brick.def.h,
                    };
                  }),
                );
                setGridBricks((currentGridBricks) => {
                  const nextGridBricks = new Map(currentGridBricks);
                  nextGridBricks.set(gridBrickId, brick);
                  return nextGridBricks;
                });
                activeBrickNameRef.current = null;
              }}
              onDragStop={(nextLayout) => {
                setGridLayout(nextLayout);
              }}
            >
              {gridLayout.map((layoutItem) => {
                const brick = gridBricks.get(layoutItem.i);

                if (brick) {
                  const BrickComponent = brick.component;

                  return (
                    <div
                      key={layoutItem.i}
                      className="size-full"
                      data-grid-brick={`${brick.def.collectionName}/${brick.def.name}`}
                    >
                      <BrickComponent />
                    </div>
                  );
                }

                return (
                  <div
                    key={layoutItem.i}
                    data-testid={`grid-${layoutItem.i}`}
                    className="size-full bg-zinc-300"
                  />
                );
              })}
            </GridLayout>
          )}
        </section>
      </div>
    </main>
  );
}

function CollectionNotFound() {
  return (
    <main className="mx-auto max-w-3xl p-6" data-testid="collection-not-found">
      <h1>Collection not found</h1>
      <p>The requested collection name is not registered in the brick catalog.</p>
      <Link to="/">Return to all collections</Link>
    </main>
  );
}
