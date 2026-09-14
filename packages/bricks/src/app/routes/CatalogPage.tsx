import { BrickPreviewFrame } from "../../BrickPreviewFrame";
import { useBrickBreakpoint } from "../../BrickBreakpointProvider";
import { collectionsHash } from "../../collectionsHash";
import { Link } from "react-router";
import { useState } from "react";

import { OrderedTableOfContents } from "../../OrderedTableOfContents";
import { Button } from "../../ui/button";
import { DraggableBrick } from "../DraggableBrick";

export default function CatalogPage() {
  const { breakpoint } = useBrickBreakpoint();
  const collections = Object.values(collectionsHash);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [selectedLayouts, setSelectedLayouts] = useState<Record<string, string>>({});

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
          const layouts = Object.entries(selectedVariant.layouts);
          const firstLayout = layouts[0];

          if (!firstLayout) {
            return null;
          }

          const [firstLayoutName, firstBrick] = firstLayout;
          const selectedLayoutName = selectedLayouts[collection.collectionName] || firstLayoutName;
          const { def, component: BrickComponent } =
            selectedVariant.layouts[selectedLayoutName] ?? firstBrick;

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
                                  setSelectedLayouts((current) => ({
                                    ...current,
                                    [collection.collectionName]: "",
                                  }));
                                }}
                                className="h-auto rounded-none p-0 font-normal leading-inherit text-zinc-500 underline aria-pressed:text-zinc-950 aria-pressed:no-underline"
                              >
                                {variant.variantName}
                              </Button>
                            </OrderedTableOfContents.Label>
                            <div className="pt-2">
                              <OrderedTableOfContents.List padded={false}>
                                {Object.entries(variant.layouts).map(([layoutName, brick]) => (
                                  <OrderedTableOfContents.Item key={layoutName}>
                                    <OrderedTableOfContents.Label>
                                      <Button
                                        variant="link"
                                        aria-pressed={
                                          selectedVariantName === variantName &&
                                          selectedLayoutName === layoutName
                                        }
                                        onClick={() => {
                                          setSelectedVariants((current) => ({
                                            ...current,
                                            [collection.collectionName]: variantName,
                                          }));
                                          setSelectedLayouts((current) => ({
                                            ...current,
                                            [collection.collectionName]: layoutName,
                                          }));
                                        }}
                                        className="h-auto rounded-none p-0 font-normal leading-inherit text-zinc-500 underline aria-pressed:text-zinc-950 aria-pressed:no-underline"
                                      >
                                        {brick.def.label}
                                      </Button>
                                    </OrderedTableOfContents.Label>
                                  </OrderedTableOfContents.Item>
                                ))}
                              </OrderedTableOfContents.List>
                            </div>
                          </OrderedTableOfContents.Item>
                        ))}
                      </OrderedTableOfContents.List>
                    </div>
                  </OrderedTableOfContents.Item>
                </OrderedTableOfContents.List>
              </OrderedTableOfContents.Section>
              <div className="overflow-auto bg-white py-6">
                <div className={def.w === 8 ? undefined : "ml-6"}>
                  <BrickPreviewFrame w={def.w} h={def.h}>
                    <DraggableBrick
                      brickDef={def}
                      className="size-full qrk-bricks overflow-hidden"
                      data-collection-representative={`${def.collectionName}/${def.variant}/${def.layout}`}
                    >
                      <BrickComponent breakpoint={breakpoint} data={def.data} />
                    </DraggableBrick>
                  </BrickPreviewFrame>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
