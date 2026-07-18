import { collectionsHash } from "@qrk.sh/bricks";
import { Tabs } from "@base-ui/react/tabs";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { CodeText } from "../CodeText";
import { MetadataField } from "../MetadataField";
import { useGridStore } from "../useGridStore";

export const Route = createFileRoute("/_sandbox/collections/$collectionName/")({
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

  const bricks = Object.values(collection.variants).flatMap((variant) =>
    Object.values(variant.sizes),
  );

  return (
    <>
      <div className="px-6 pt-6">
        <Link to="/" className="inline-flex items-center gap-2 text-sm">
          <ArrowLeft aria-hidden className="size-4" />
          <span>All collections</span>
        </Link>
        <dl className="mt-5 grid max-w-[500px] grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <MetadataField label="Collection name">{collection.collectionLabel}</MetadataField>
          <MetadataField label="Collection ID" className="text-right">
            <CodeText>{collection.collectionName}</CodeText>
          </MetadataField>
          <MetadataField label="Collection description" className="col-span-2">
            {collection.collectionDescription}
          </MetadataField>
        </dl>
      </div>
      <div className="mt-8 flex flex-col gap-10">
        {bricks.map((brick) => {
          const BrickComponent = brick.component;
          const variant = collection.variants[brick.def.variant];

          return (
            <section key={`${brick.def.variant}/${brick.def.size}`}>
              <Tabs.Root value={`${brick.def.variant}--${brick.def.size}-preview`}>
                <div className="flex items-baseline justify-between gap-4 px-6">
                  <div>
                    <h2 className="m-0 text-2xl font-semibold">{brick.def.variant}</h2>
                    <p className="mb-0 mt-1 text-sm text-zinc-500">
                      {collection.variants[brick.def.variant]?.variantDescription}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-baseline gap-2">
                    <Tabs.List
                      className="flex gap-2 text-sm"
                      aria-label={`${brick.def.label} preview`}
                    >
                      <Tabs.Tab
                        value={`${brick.def.variant}--${brick.def.size}-preview`}
                        className={(state) =>
                          state.active
                            ? "cursor-pointer border-0 bg-transparent p-0 font-medium text-zinc-950 no-underline"
                            : "cursor-pointer border-0 bg-transparent p-0 text-zinc-500 underline underline-offset-2"
                        }
                      >
                        {brick.def.size}
                      </Tabs.Tab>
                    </Tabs.List>
                    <Link
                      to="/collections/$collectionName/$variantName"
                      params={{
                        collectionName: brick.def.collectionName,
                        variantName: brick.def.variant,
                      }}
                      className="text-sm text-zinc-500 underline underline-offset-2"
                    >
                      Configure
                    </Link>
                  </div>
                </div>
                <Tabs.Panel value={`${brick.def.variant}--${brick.def.size}-preview`}>
                  <div className="mt-6 overflow-auto">
                    <div
                      className={
                        brick.def.w === 8
                          ? "qrk-bricks cursor-grab overflow-hidden active:cursor-grabbing"
                          : "qrk-bricks ml-6 cursor-grab overflow-hidden active:cursor-grabbing"
                      }
                      data-brick-full-size={`${brick.def.collectionName}/${brick.def.variant}/${brick.def.size}`}
                      draggable
                      onDragStart={(event) => {
                        setActiveBrickDrag(brick.def);
                        event.dataTransfer.effectAllowed = "copy";
                        event.dataTransfer.setData("text/plain", brick.def.size);
                      }}
                      onDragEnd={() => {
                        setActiveBrickDrag(null);
                      }}
                      style={{
                        width: `${(brick.def.w / 8) * 100}%`,
                        aspectRatio: `${brick.def.w} / ${brick.def.h}`,
                      }}
                    >
                      {variant?.defaultData === undefined ? (
                        <BrickComponent />
                      ) : (
                        <BrickComponent data={variant.defaultData} />
                      )}
                    </div>
                  </div>
                </Tabs.Panel>
              </Tabs.Root>
            </section>
          );
        })}
      </div>
    </>
  );
}
