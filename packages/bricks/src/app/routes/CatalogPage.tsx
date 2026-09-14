import { CollectionOutline } from "../CollectionOutline";
import { BrickPreviewFrame } from "../../BrickPreviewFrame";
import { useBrickBreakpoint } from "../../BrickBreakpointProvider";
import { collectionsHash } from "../../collectionsHash";
import { Link } from "react-router";
import { useState } from "react";

import { Outline } from "../../Outline";
import { Button } from "../../ui/button";
import { DraggableBrick } from "../DraggableBrick";

export default function CatalogPage() {
  const { breakpoint } = useBrickBreakpoint();
  const collections = Object.values(collectionsHash);
  const [selectedContents, setSelectedContents] = useState<Record<string, string>>({});
  const [selectedViews, setSelectedViews] = useState<Record<string, string>>({});

  return (
    <div aria-label="Brick collections" className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-16">
        {collections.map((collection) => {
          const contents = Object.entries(collection.contents);
          const firstContentEntry = contents[0];

          if (!firstContentEntry) {
            return null;
          }

          const [firstContentName, firstContent] = firstContentEntry;
          const selectedContentName =
            selectedContents[collection.collectionName] ?? firstContentName;
          const selectedContent = collection.contents[selectedContentName] ?? firstContent;
          const views = Object.entries(selectedContent.views);
          const firstView = views[0];

          if (!firstView) {
            return null;
          }

          const [firstViewName, firstBrick] = firstView;
          const selectedViewName = selectedViews[collection.collectionName] || firstViewName;
          const { def, component: BrickComponent } =
            selectedContent.views[selectedViewName] ?? firstBrick;

          return (
            <div key={collection.collectionName} data-collection-entry={collection.collectionName}>
              <Outline.Title sticky>
                <Link
                  to={`/collections/${encodeURIComponent(collection.collectionName)}`}
                  data-collection-link={collection.collectionName}
                >
                  {collection.collectionLabel}
                </Link>
              </Outline.Title>
              <CollectionOutline
                collection={collection}
                renderContent={(contentName, label) => (
                  <Button
                    variant="link"
                    aria-pressed={selectedContentName === contentName}
                    onClick={() => {
                      setSelectedContents((current) => ({
                        ...current,
                        [collection.collectionName]: contentName,
                      }));
                      setSelectedViews((current) => ({
                        ...current,
                        [collection.collectionName]: "",
                      }));
                    }}
                    className="h-auto rounded-none p-0 font-normal leading-inherit text-zinc-500 underline aria-pressed:text-zinc-950 aria-pressed:no-underline"
                  >
                    {label}
                  </Button>
                )}
                renderView={(contentName, viewName, label) => (
                  <Button
                    variant="link"
                    aria-pressed={
                      selectedContentName === contentName && selectedViewName === viewName
                    }
                    onClick={() => {
                      setSelectedContents((current) => ({
                        ...current,
                        [collection.collectionName]: contentName,
                      }));
                      setSelectedViews((current) => ({
                        ...current,
                        [collection.collectionName]: viewName,
                      }));
                    }}
                    className="h-auto rounded-none p-0 font-normal leading-inherit text-zinc-500 underline aria-pressed:text-zinc-950 aria-pressed:no-underline"
                  >
                    {label}
                  </Button>
                )}
              />
              <div className="overflow-auto bg-white py-6">
                <div className={def.w === 8 ? undefined : "ml-6"}>
                  <BrickPreviewFrame w={def.w} h={def.h}>
                    <DraggableBrick
                      brickDef={def}
                      className="size-full qrk-bricks overflow-hidden"
                      data-collection-representative={`${def.collectionName}/${def.content}/${def.view}`}
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
