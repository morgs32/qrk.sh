import { collectionsHash } from "@qrk.sh/bricks";
import { Link } from "react-router";
import { useState } from "react";

import { OrderedTableOfContents } from "../../OrderedTableOfContents";
import { Button } from "../../ui/button";
import { DraggableBrick } from "../DraggableBrick";

export default function CatalogPage() {
  const collections = Object.values(collectionsHash);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [selectedSizes, setSelectedSizes] = useState<Record<string, string>>({});

  return (
    <div aria-label="Brick collections" className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {collections.map((collection, collectionIndex) => {
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
          const { def, component: BrickComponent } =
            selectedVariant.sizes[selectedSizeName] ?? firstBrick;

          return (
            <div key={collection.collectionName} data-collection-entry={collection.collectionName}>
              <OrderedTableOfContents.Section>
                <OrderedTableOfContents.List start={collectionIndex + 1} padded={false}>
                  <OrderedTableOfContents.Item>
                    <OrderedTableOfContents.Label sticky>
                      <Link
                        to={`/collections/${encodeURIComponent(collection.collectionName)}`}
                        data-collection-link={collection.collectionName}
                      >
                        {collection.collectionLabel}
                      </Link>
                    </OrderedTableOfContents.Label>
                    <div className="pt-2">
                      <OrderedTableOfContents.List padded={false} spaced>
                        <OrderedTableOfContents.Item>
                          <OrderedTableOfContents.Label>Variant</OrderedTableOfContents.Label>
                          <div className="pt-2">
                            <OrderedTableOfContents.List padded={false}>
                              {variants.map(([variantName, variant]) => (
                                <OrderedTableOfContents.Item key={variantName}>
                                  <OrderedTableOfContents.Label>
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
                                      {variant.variantLabel}
                                    </Button>
                                  </OrderedTableOfContents.Label>
                                </OrderedTableOfContents.Item>
                              ))}
                            </OrderedTableOfContents.List>
                          </div>
                        </OrderedTableOfContents.Item>
                        <OrderedTableOfContents.Item>
                          <OrderedTableOfContents.Label>Size</OrderedTableOfContents.Label>
                          <div className="pt-2">
                            <OrderedTableOfContents.List padded={false}>
                              {sizes.map(([sizeName, brick]) => (
                                <OrderedTableOfContents.Item key={sizeName}>
                                  <OrderedTableOfContents.Label>
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
                                  </OrderedTableOfContents.Label>
                                </OrderedTableOfContents.Item>
                              ))}
                            </OrderedTableOfContents.List>
                          </div>
                        </OrderedTableOfContents.Item>
                      </OrderedTableOfContents.List>
                    </div>
                  </OrderedTableOfContents.Item>
                </OrderedTableOfContents.List>
              </OrderedTableOfContents.Section>
              <div className="overflow-auto bg-white py-6">
                <DraggableBrick
                  brickDef={def}
                  className={
                    def.w === 8
                      ? "qrk-bricks overflow-hidden"
                      : "qrk-bricks ml-6 overflow-hidden"
                  }
                  data-collection-representative={`${def.collectionName}/${def.variant}/${def.size}`}
                  style={{
                    width: `${(def.w / 8) * 100}%`,
                    aspectRatio: `${def.w} / ${def.h}`,
                  }}
                >
                  {selectedVariant.defaultData === undefined ? (
                    <BrickComponent />
                  ) : (
                    <BrickComponent data={selectedVariant.defaultData} />
                  )}
                </DraggableBrick>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
