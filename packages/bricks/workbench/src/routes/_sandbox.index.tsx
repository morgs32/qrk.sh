import { collectionsHash } from "@qrk.sh/bricks";
import { Tabs } from "@base-ui/react/tabs";
import { Link, createFileRoute } from "@tanstack/react-router";

import { useGridStore } from "../useGridStore";

export const Route = createFileRoute("/_sandbox/")({ component: CatalogPage });

function CatalogPage() {
  const collections = Object.values(collectionsHash);
  const setActiveBrickDrag = useGridStore((state) => state.setActiveBrickDrag);

  return (
    <div aria-label="Brick collections">
      <div className="px-6 pt-6">
        <p className="mb-2 text-sm font-medium uppercase tracking-[0.18em] text-zinc-500">
          Development sandbox
        </p>
        <h1 className="m-0 text-4xl font-semibold tracking-tight">Brick collections</h1>
      </div>
      <div className="mt-8 flex flex-col gap-10">
        {collections.map((collection) => {
          const representativeBrick = Object.values(collection.bricks)[0];

          return (
            <section
              key={collection.collectionName}
              data-collection-entry={collection.collectionName}
            >
              <Tabs.Root defaultValue={representativeBrick.def.name}>
                <div className="flex items-baseline justify-between gap-4 px-6">
                  <h2 className="m-0 text-2xl font-semibold">{collection.collectionLabel}</h2>
                  <div className="flex shrink-0 gap-2 text-sm">
                    <Tabs.List className="flex gap-2">
                      {Object.values(collection.bricks).map((brick) => (
                        <Tabs.Tab
                          key={brick.def.name}
                          value={brick.def.name}
                          className={(state) =>
                            state.active
                              ? "cursor-pointer border-0 bg-transparent p-0 font-medium text-zinc-950 no-underline"
                              : "cursor-pointer border-0 bg-transparent p-0 text-zinc-500 underline underline-offset-2"
                          }
                        >
                          {brick.def.name}
                        </Tabs.Tab>
                      ))}
                    </Tabs.List>
                    <Link
                      to="/collections/$collectionName"
                      params={{ collectionName: collection.collectionName }}
                      data-collection-link={collection.collectionName}
                    >
                      View all
                    </Link>
                  </div>
                </div>
                {Object.values(collection.bricks).map((brick) => {
                  const BrickComponent = brick.component;

                  return (
                    <Tabs.Panel key={brick.def.name} value={brick.def.name}>
                      <div className="mt-6 overflow-auto">
                        <div
                          className={
                            brick.def.w === 8
                              ? "qrk-bricks cursor-grab overflow-hidden active:cursor-grabbing"
                              : "qrk-bricks ml-6 cursor-grab overflow-hidden active:cursor-grabbing"
                          }
                          data-collection-representative={`${brick.def.collectionName}/${brick.def.name}`}
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
                  );
                })}
              </Tabs.Root>
            </section>
          );
        })}
      </div>
    </div>
  );
}
