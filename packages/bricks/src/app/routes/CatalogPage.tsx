import { collectionsHash } from "@qrk.sh/bricks";
import { Link } from "react-router";
import { useState } from "react";

import { OrderedTableOfContents } from "../../OrderedTableOfContents";
import { Button } from "../../ui/button";
import { useGridStore } from "../useGridStore";

export default function CatalogPage() {
  const collections = Object.values(collectionsHash);
  const setActiveBrickDrag = useGridStore((state) => state.setActiveBrickDrag);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [selectedSizes, setSelectedSizes] = useState<Record<string, string>>({});

  return (
    <div aria-label="Brick collections" className="h-full overflow-hidden">
      <OrderedTableOfContents>
        <OrderedTableOfContents.List scrollable>
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
              <OrderedTableOfContents.Item key={collection.collectionName}>
                <OrderedTableOfContents.Label sticky>
                  <Link
                    to={`/collections/${encodeURIComponent(collection.collectionName)}`}
                    data-collection-link={collection.collectionName}
                  >
                    {collection.collectionLabel}
                  </Link>
                </OrderedTableOfContents.Label>
                <section data-collection-entry={collection.collectionName} className="shrink-0">
                  <div className="bg-zinc-100 px-4 pb-2 font-mono text-sm">
                    <OrderedTableOfContents.List>
                      <OrderedTableOfContents.Item>
                        <OrderedTableOfContents.Label>Variant</OrderedTableOfContents.Label>
                        <OrderedTableOfContents.List>
                          {variants.map(([variantName]) => (
                            <OrderedTableOfContents.Item key={variantName}>
                              <Button
                                variant="link"
                                aria-pressed={selectedVariantName === variantName}
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
                                className="h-auto rounded-none p-0 font-normal leading-inherit text-zinc-500 underline aria-pressed:text-zinc-950 aria-pressed:no-underline"
                              >
                                {variantName[0].toUpperCase() + variantName.slice(1)}
                              </Button>
                            </OrderedTableOfContents.Item>
                          ))}
                        </OrderedTableOfContents.List>
                      </OrderedTableOfContents.Item>
                      <OrderedTableOfContents.Item>
                        <OrderedTableOfContents.Label>Size</OrderedTableOfContents.Label>
                        <OrderedTableOfContents.List>
                          {sizes.map(([sizeName, brick]) => (
                            <OrderedTableOfContents.Item key={sizeName}>
                              <Button
                                variant="link"
                                aria-pressed={selectedSizeName === sizeName}
                                onClick={() => {
                                  setSelectedSizes((current) => ({
                                    ...current,
                                    [collection.collectionName]: sizeName,
                                  }));
                                }}
                                className="h-auto rounded-none p-0 font-normal leading-inherit text-zinc-500 underline aria-pressed:text-zinc-950 aria-pressed:no-underline"
                              >
                                {brick.def.size}
                              </Button>
                            </OrderedTableOfContents.Item>
                          ))}
                        </OrderedTableOfContents.List>
                      </OrderedTableOfContents.Item>
                    </OrderedTableOfContents.List>
                  </div>
                  <div className="overflow-auto py-6">
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
                      {selectedVariant.defaultData === undefined ? (
                        <BrickComponent />
                      ) : (
                        <BrickComponent data={selectedVariant.defaultData} />
                      )}
                    </div>
                  </div>
                </section>
              </OrderedTableOfContents.Item>
            );
          })}
        </OrderedTableOfContents.List>
      </OrderedTableOfContents>
    </div>
  );
}
