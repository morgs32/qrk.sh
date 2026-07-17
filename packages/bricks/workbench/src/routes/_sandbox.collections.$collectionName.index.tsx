import { collectionsHash } from "@qrk.sh/bricks";
import { Tabs } from "@base-ui/react/tabs";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "../../../src/ui/button";
import { useGridStore } from "../useGridStore";

export const Route = createFileRoute("/_sandbox/collections/$collectionName/")({
  component: CollectionCatalog,
});

function CollectionCatalog() {
  const { collectionName } = Route.useParams();
  const [activeViews, setActiveViews] = useState<Record<string, string | number>>({});
  const [isCollectionDataExpanded, setIsCollectionDataExpanded] = useState(false);
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
        <Link to="/" className="inline-flex items-center gap-2 text-sm">
          <ArrowLeft aria-hidden className="size-4" />
          <span>All collections</span>
        </Link>
        <h1 className="mb-1 mt-5 text-4xl font-semibold tracking-tight">
          {collection.collectionLabel}
        </h1>
        <p className="mt-0 font-mono text-sm text-zinc-500">{collection.collectionName}</p>
        <Button
          type="button"
          size="sm"
          className="mt-4"
          aria-controls="collection-data-section"
          aria-expanded={isCollectionDataExpanded}
          onClick={() => setIsCollectionDataExpanded((currentValue) => !currentValue)}
        >
          View data
        </Button>
        {isCollectionDataExpanded && (
          <section
            id="collection-data-section"
            className="mt-4 border border-zinc-300 bg-white p-4 text-sm"
          >
            Hello World
          </section>
        )}
      </div>
      <div className="mt-8 flex flex-col gap-10">
        {bricks.map((brick) => {
          const BrickComponent = brick.component;

          return (
            <section key={brick.def.name}>
              <Tabs.Root
                value={activeViews[brick.def.name] ?? `${brick.def.name}-preview`}
                onValueChange={(nextValue) => {
                  setActiveViews((currentViews) => {
                    return {
                      ...currentViews,
                      [brick.def.name]: nextValue,
                    };
                  });
                }}
              >
                <div className="flex items-baseline justify-between gap-4 px-6">
                  <h2 className="m-0 text-2xl font-semibold">{brick.def.label}</h2>
                  <Tabs.List
                    className="flex shrink-0 gap-2 text-sm"
                    aria-label={`${brick.def.label} view`}
                  >
                    <Tabs.Tab
                      value={`${brick.def.name}-preview`}
                      className={(state) =>
                        state.active
                          ? "cursor-pointer border-0 bg-transparent p-0 font-medium text-zinc-950 no-underline"
                          : "cursor-pointer border-0 bg-transparent p-0 text-zinc-500 underline underline-offset-2"
                      }
                    >
                      Preview
                    </Tabs.Tab>
                    <Tabs.Tab
                      value={`${brick.def.name}-data`}
                      className={(state) =>
                        state.active
                          ? "cursor-pointer border-0 bg-transparent p-0 font-medium text-zinc-950 no-underline"
                          : "cursor-pointer border-0 bg-transparent p-0 text-zinc-500 underline underline-offset-2"
                      }
                    >
                      View config
                    </Tabs.Tab>
                  </Tabs.List>
                </div>
                <Tabs.Panel value={`${brick.def.name}-preview`}>
                  <div className="mt-6 overflow-auto">
                    <div
                      className={
                        brick.def.w === 8
                          ? "qrk-bricks cursor-grab overflow-hidden active:cursor-grabbing"
                          : "qrk-bricks ml-6 cursor-grab overflow-hidden active:cursor-grabbing"
                      }
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
                </Tabs.Panel>
                <Tabs.Panel value={`${brick.def.name}-data`}>
                  <pre className="mx-6 mt-6 overflow-auto bg-zinc-100 p-4 text-xs">
                    {JSON.stringify(brick.def, null, 2)}
                  </pre>
                </Tabs.Panel>
              </Tabs.Root>
            </section>
          );
        })}
      </div>
    </>
  );
}
