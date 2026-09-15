import { CatalogOutline } from "../CatalogOutline";
import { BrickPreviewFrame } from "../../BrickPreviewFrame";
import { useBrickBreakpoint } from "../../BrickBreakpointProvider";
import { catalogsHash } from "../../catalogsHash";
import { Link } from "react-router";
import { useState } from "react";
import { Pencil } from "lucide-react";

import { Outline } from "../../Outline";
import { Button } from "../../ui/button";
import { DraggableBrick } from "../DraggableBrick";

export default function CatalogsPage() {
  const { breakpoint } = useBrickBreakpoint();
  const catalogs = Object.values(catalogsHash);
  const [selectedContents, setSelectedContents] = useState<Record<string, string>>({});
  const [selectedViews, setSelectedViews] = useState<Record<string, string>>({});

  return (
    <div aria-label="Brick catalogs" className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-16">
        {catalogs.map((catalog) => {
          const contents = Object.entries(catalog.contents);
          const firstContentEntry = contents[0];

          if (!firstContentEntry) {
            return null;
          }

          const [firstContentName, firstContent] = firstContentEntry;
          const selectedContentName = selectedContents[catalog.catalogName] ?? firstContentName;
          const selectedContent = catalog.contents[selectedContentName] ?? firstContent;
          const views = Object.entries(selectedContent.views);
          const firstView = views[0];

          if (!firstView) {
            return null;
          }

          const [firstViewName, firstBrick] = firstView;
          const selectedViewName = selectedViews[catalog.catalogName] || firstViewName;
          const { def, component: BrickComponent } =
            selectedContent.views[selectedViewName] ?? firstBrick;

          return (
            <div key={catalog.catalogName} data-catalog-entry={catalog.catalogName}>
              <Outline.Title sticky>
                <Link
                  to={`/catalogs/${encodeURIComponent(catalog.catalogName)}`}
                  data-catalog-link={catalog.catalogName}
                >
                  {catalog.catalogLabel}
                </Link>
              </Outline.Title>
              <CatalogOutline
                catalog={catalog}
                renderContent={(contentName, label) => (
                  <Button
                    variant="link"
                    aria-pressed={selectedContentName === contentName}
                    onClick={() => {
                      setSelectedContents((current) => ({
                        ...current,
                        [catalog.catalogName]: contentName,
                      }));
                      setSelectedViews((current) => ({
                        ...current,
                        [catalog.catalogName]: "",
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
                        [catalog.catalogName]: contentName,
                      }));
                      setSelectedViews((current) => ({
                        ...current,
                        [catalog.catalogName]: viewName,
                      }));
                    }}
                    className="h-auto rounded-none p-0 font-normal leading-inherit text-zinc-500 underline aria-pressed:text-zinc-950 aria-pressed:no-underline"
                  >
                    {label}
                  </Button>
                )}
              />
              <div className="overflow-auto bg-white py-6">
                <div className={def.w === 8 ? undefined : "px-4"}>
                  <BrickPreviewFrame w={def.w} h={def.h}>
                    <DraggableBrick
                      brickDef={def}
                      className="size-full qrk-bricks overflow-hidden"
                      data-catalog-representative={`${def.catalogName}/${def.content}/${def.view}`}
                    >
                      <BrickComponent breakpoint={breakpoint} data={def.data} />
                      <Button asChild variant="ghost" size="icon" className="brick-edit-handle">
                        <Link
                          aria-label="Configure view"
                          to={`/catalogs/${encodeURIComponent(def.catalogName)}?content=${encodeURIComponent(def.content)}&view=${encodeURIComponent(def.view)}`}
                        >
                          <Pencil aria-hidden className="size-4" />
                        </Link>
                      </Button>
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
