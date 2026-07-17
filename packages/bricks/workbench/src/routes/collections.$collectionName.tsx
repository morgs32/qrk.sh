import { useEffect, useRef } from "react";
import { collectionsHash, findCollectionBrick } from "@qrk.sh/bricks";
import { Link, Outlet, createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import GridLayout, { useContainerWidth, verticalCompactor } from "react-grid-layout";

import { useGridStore } from "../useGridStore";

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
  const navigate = useNavigate();
  const suppressGridBrickClickRef = useRef(false);
  const hasHydrated = useGridStore((state) => state.hasHydrated);
  const collectionGrid = useGridStore((state) => state.collectionGrids[collectionName]);
  const activeBrickDrag = useGridStore((state) => state.activeBrickDrag);
  const ensureCollectionGrid = useGridStore((state) => state.ensureCollectionGrid);
  const setCollectionLayout = useGridStore((state) => state.setCollectionLayout);
  const addGridBrick = useGridStore((state) => state.addGridBrick);
  const setActiveBrickDrag = useGridStore((state) => state.setActiveBrickDrag);
  const collection = Object.values(collectionsHash).find(
    (candidate) => candidate.collectionName === collectionName,
  );

  useEffect(() => {
    if (!useGridStore.persist.hasHydrated()) {
      void useGridStore.persist.rehydrate();
    }
  }, []);

  useEffect(() => {
    if (hasHydrated) {
      ensureCollectionGrid(collectionName);
    }
  }, [collectionName, ensureCollectionGrid, hasHydrated]);

  if (!collection) {
    throw notFound();
  }

  const gridLayout = collectionGrid?.layout ?? [];
  const gridWidth = Math.max(width, 1);
  const rowHeight = gridWidth / 8;

  return (
    <main className="min-h-screen">
      <div className="grid min-h-screen md:grid-cols-2">
        <section className="border-b border-zinc-300 pb-6 md:border-b-0 md:border-r md:pb-0">
          <Outlet />
        </section>

        <section ref={containerRef} aria-label="Brick grid" className="min-h-screen bg-white">
          {mounted && hasHydrated && collectionGrid && (
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
                    event.dataTransfer?.getData("text/plain") || activeBrickDrag?.name;
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
                  activeBrickDrag?.name;
                const brick = Object.values(collection.bricks).find(
                  (candidate) => candidate.def.name === brickName,
                );

                if (!brick) {
                  return;
                }

                const gridBrickId = crypto.randomUUID();
                const gridLayoutWithDroppedBrick = nextLayout.map((layoutItem) => {
                  if (layoutItem.i !== item.i) {
                    return layoutItem;
                  }

                  return {
                    ...layoutItem,
                    i: gridBrickId,
                    w: brick.def.w,
                    h: brick.def.h,
                  };
                });
                addGridBrick(collectionName, gridBrickId, brick.def, gridLayoutWithDroppedBrick);
                setActiveBrickDrag(null);
              }}
              onDragStart={() => {
                suppressGridBrickClickRef.current = true;
              }}
              onDragStop={(nextLayout) => {
                setCollectionLayout(collectionName, nextLayout);
                window.setTimeout(() => {
                  suppressGridBrickClickRef.current = false;
                }, 0);
              }}
            >
              {gridLayout.map((layoutItem) => {
                const brickDef = collectionGrid.gridBricksById[layoutItem.i];
                const brick = brickDef ? findCollectionBrick(brickDef) : undefined;

                if (brick) {
                  const BrickComponent = brick.component;

                  return (
                    <div
                      key={layoutItem.i}
                      className="size-full cursor-grab active:cursor-grabbing"
                      data-grid-brick={`${brick.def.collectionName}/${brick.def.name}`}
                      data-grid-x={layoutItem.x}
                      data-grid-y={layoutItem.y}
                      onClick={() => {
                        if (suppressGridBrickClickRef.current) {
                          return;
                        }

                        void navigate({
                          to: "/collections/$collectionName/gridBrick/$gridBrickId",
                          params: { collectionName, gridBrickId: layoutItem.i },
                        });
                      }}
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
