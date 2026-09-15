import { BrickPreviewFrame } from "@qrk.sh/bricks/BrickPreviewFrame";
import { useBrickBreakpoint } from "@qrk.sh/bricks/BrickBreakpointProvider";
import { catalogsHash } from "@qrk.sh/bricks";
import { Tabs } from "radix-ui";
import { href, Link, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";

import { CodeText } from "../[username]/site/[siteId]/page/[pageId]/BrickCatalog/CodeText";
import { MetadataField } from "../[username]/site/[siteId]/page/[pageId]/BrickCatalog/MetadataField";
import { BRICK_DRAG_MIME, useBrickDrawerStore } from "@/components/home/useBrickDrawerStore";

export default function BrickCatalogRoute() {
  const { breakpoint } = useBrickBreakpoint();
  const params = useParams();
  const { username, siteId, pageId } = params;
  if (!username || !siteId || !pageId) throw new Error("Missing editor route params");
  const { catalogName } = params;

  const catalog = Object.values(catalogsHash).find(
    (candidate) => candidate.catalogName === catalogName,
  );

  if (!catalog) {
    return (
      <div className="p-6" data-testid="catalog-not-found">
        <h1>Catalog not found</h1>
        <Link
          to={href("/:username/site/:siteId/page/:pageId/brick-catalog", {
            username,
            siteId,
            pageId,
          })}
        >
          All catalogs
        </Link>
      </div>
    );
  }

  const bricks = Object.values(catalog.contents).flatMap((content) => Object.values(content.views));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-6">
      <div className="px-6 pt-6">
        <Link
          to={href("/:username/site/:siteId/page/:pageId/brick-catalog", {
            username,
            siteId,
            pageId,
          })}
          className="inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft aria-hidden className="size-4" />
          <span>All catalogs</span>
        </Link>
        <dl className="mt-5 grid max-w-[500px] grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <MetadataField label="Catalog name">{catalog.catalogLabel}</MetadataField>
          <MetadataField label="Catalog ID" className="text-right">
            <CodeText>{catalog.catalogName}</CodeText>
          </MetadataField>
          <MetadataField label="Catalog description" className="col-span-2">
            {catalog.catalogDescription}
          </MetadataField>
        </dl>
      </div>
      <div className="mt-8 flex flex-col gap-10">
        {bricks.map((brick) => {
          const BrickComponent = brick.component;
          const content = catalog.contents[brick.def.content];

          return (
            <section key={`${brick.def.content}/${brick.def.view}`}>
              <Tabs.Root value={`${brick.def.content}--${brick.def.view}-preview`}>
                <div className="flex items-baseline justify-between gap-4 px-6">
                  <div>
                    <h2 className="m-0 text-2xl font-semibold">{brick.def.content}</h2>
                    <p className="mb-0 mt-1 text-sm text-zinc-500">
                      {catalog.contents[brick.def.content]?.contentDescription}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-baseline gap-2">
                    <Tabs.List
                      className="flex gap-2 text-sm"
                      aria-label={`${brick.def.view} preview`}
                    >
                      <Tabs.Trigger
                        value={`${brick.def.content}--${brick.def.view}-preview`}
                        className="cursor-pointer border-0 bg-transparent p-0 text-sm font-medium text-zinc-950"
                      >
                        {brick.def.label}
                      </Tabs.Trigger>
                    </Tabs.List>
                  </div>
                </div>
                <Tabs.Content value={`${brick.def.content}--${brick.def.view}-preview`}>
                  <div className="mt-6 overflow-auto">
                    <div className={brick.def.w === 8 ? undefined : "ml-6"}>
                      <BrickPreviewFrame w={brick.def.w} h={brick.def.h}>
                        <div
                          className="size-full qrk-bricks cursor-grab overflow-hidden active:cursor-grabbing"
                          data-brick-full-view={`${brick.def.catalogName}/${brick.def.content}/${brick.def.view}`}
                          data-brick-drawer-brick-slot
                          data-brick-drawer-catalog-name={brick.def.catalogName}
                          data-brick-drawer-content={brick.def.content}
                          data-brick-drawer-view={brick.def.view}
                          draggable
                          onDragStart={(event) => {
                            useBrickDrawerStore
                              .getState()
                              .registerActiveBrickDragGridShape(brick.def.w, brick.def.h);
                            event.dataTransfer.setData(BRICK_DRAG_MIME, JSON.stringify(brick.def));
                            event.dataTransfer.effectAllowed = "copy";
                            event.dataTransfer.setData("text/plain", brick.def.view);
                          }}
                          onDragEnd={() => {
                            useBrickDrawerStore.getState().unregisterActiveBrickDragGridShape();
                          }}
                        >
                          <BrickComponent breakpoint={breakpoint} data={content?.defaultData} />
                        </div>
                      </BrickPreviewFrame>
                    </div>
                  </div>
                </Tabs.Content>
              </Tabs.Root>
            </section>
          );
        })}
      </div>
    </div>
  );
}
