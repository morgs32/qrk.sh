import { collectionsHash } from "@qrk.sh/bricks";
import { Tabs } from "@base-ui/react/tabs";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { useGridStore } from "../useGridStore";

export const Route = createFileRoute("/_sandbox/")({ component: CatalogPage });

function CatalogPage() {
  const collections = Object.values(collectionsHash);
  const setActiveBrickDrag = useGridStore((state) => state.setActiveBrickDrag);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [selectedSizes, setSelectedSizes] = useState<Record<string, string>>({});

  return (
    <div aria-label="Brick collections">
      <div className="px-6 pt-6">
        <h1 className="m-0 text-4xl font-semibold tracking-tight">Brick collections</h1>
      </div>
      <div className="mt-8 flex flex-col gap-10">
        {collections.map((collection) => {
          const variants = Object.entries(collection.variants);
          const firstVariantEntry = variants[0];

          if (!firstVariantEntry) {
            return null;
          }

          const [firstVariantName, firstVariant] = firstVariantEntry;
          const selectedVariantName =
            selectedVariants[collection.collectionName] ?? firstVariantName;
          const selectedVariant = collection.variants[selectedVariantName] ?? firstVariant;
          const sizes = Object.entries(selectedVariant.sizes);
          const firstSize = sizes[0];

          if (!firstSize) {
            return null;
          }

          const [firstSizeName, firstBrick] = firstSize;
          const selectedSizeName = selectedSizes[collection.collectionName] || firstSizeName;
          const selectedBrick = selectedVariant.sizes[selectedSizeName] ?? firstBrick;
          const BrickComponent = selectedBrick.component;

          return (
            <section
              key={collection.collectionName}
              data-collection-entry={collection.collectionName}
            >
              <div className="flex items-start justify-between gap-4 px-6">
                <div>
                  <h2 className="m-0 text-2xl font-semibold">{collection.collectionLabel}</h2>
                  <p className="mt-1 mb-0 text-sm text-zinc-500">
                    {collection.collectionDescription}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
                  <Tabs.Root value={selectedVariantName}>
                    <Tabs.List
                      aria-label={`${collection.collectionLabel} variants`}
                      className="flex gap-2"
                    >
                      {variants.map(([variantName]) => (
                        <Tabs.Tab
                          key={variantName}
                          value={variantName}
                          onClick={() => {
                            setSelectedVariants((current) => ({
                              ...current,
                              [collection.collectionName]: variantName,
                            }));
                            setSelectedSizes((current) => ({
                              ...current,
                              [collection.collectionName]: "",
                            }));
                          }}
                          className={(state) =>
                            state.active
                              ? "cursor-pointer border-0 bg-transparent p-0 font-medium text-zinc-950 no-underline"
                              : "cursor-pointer border-0 bg-transparent p-0 text-zinc-500 underline underline-offset-2"
                          }
                        >
                          {variantName[0].toUpperCase() + variantName.slice(1)}
                        </Tabs.Tab>
                      ))}
                    </Tabs.List>
                  </Tabs.Root>
                  <Tabs.Root value={selectedSizeName}>
                    <div className="flex items-baseline gap-2">
                      <Tabs.List
                        aria-label={`${collection.collectionLabel} sizes`}
                        className="flex gap-2"
                      >
                        {sizes.map(([sizeName, brick]) => (
                          <Tabs.Tab
                            key={sizeName}
                            value={sizeName}
                            onClick={() => {
                              setSelectedSizes((current) => ({
                                ...current,
                                [collection.collectionName]: sizeName,
                              }));
                            }}
                            className={(state) =>
                              state.active
                                ? "cursor-pointer border-0 bg-transparent p-0 font-medium text-zinc-950 no-underline"
                                : "cursor-pointer border-0 bg-transparent p-0 text-zinc-500 underline underline-offset-2"
                            }
                          >
                            {brick.def.size}
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
                  </Tabs.Root>
                </div>
              </div>
              <div className="mt-6 overflow-auto">
                <div
                  className={
                    selectedBrick.def.w === 8
                      ? "qrk-bricks cursor-grab overflow-hidden active:cursor-grabbing"
                      : "qrk-bricks ml-6 cursor-grab overflow-hidden active:cursor-grabbing"
                  }
                  data-collection-representative={`${selectedBrick.def.collectionName}/${selectedBrick.def.variant}/${selectedBrick.def.size}`}
                  draggable
                  onDragStart={(event) => {
                    setActiveBrickDrag(selectedBrick.def);
                    event.dataTransfer.effectAllowed = "copy";
                    event.dataTransfer.setData("text/plain", selectedBrick.def.size);
                  }}
                  onDragEnd={() => {
                    setActiveBrickDrag(null);
                  }}
                  style={{
                    width: `${(selectedBrick.def.w / 8) * 100}%`,
                    aspectRatio: `${selectedBrick.def.w} / ${selectedBrick.def.h}`,
                  }}
                >
                  <BrickComponent />
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
