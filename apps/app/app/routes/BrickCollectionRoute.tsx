import { useBrickBreakpoint } from "@qrk.sh/bricks/BrickBreakpointProvider";
import { collectionsHash } from "@qrk.sh/bricks";
import { Tabs } from "radix-ui";
import { href, Link, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";

import { CodeText } from "../[username]/site/[siteId]/page/[pageId]/BrickCatalog/CodeText";
import { MetadataField } from "../[username]/site/[siteId]/page/[pageId]/BrickCatalog/MetadataField";
import { BRICK_DRAG_MIME, useBrickDrawerStore } from "@/components/home/useBrickDrawerStore";

export default function BrickCollectionRoute() {
  const { breakpoint } = useBrickBreakpoint();
  const params = useParams();
  const { username, siteId, pageId } = params;
  if (!username || !siteId || !pageId) throw new Error("Missing editor route params");
  const { collectionName } = params;

  const collection = Object.values(collectionsHash).find(
    (candidate) => candidate.collectionName === collectionName,
  );

  if (!collection) {
    return (
      <div className="p-6" data-testid="collection-not-found">
        <h1>Collection not found</h1>
        <Link
          to={href("/:username/site/:siteId/page/:pageId/brick-catalog", {
            username,
            siteId,
            pageId,
          })}
        >
          All collections
        </Link>
      </div>
    );
  }

  const bricks = Object.values(collection.variants).flatMap((variant) =>
    Object.values(variant.layouts),
  );

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
            <section key={`${brick.def.variant}/${brick.def.layout}`}>
              <Tabs.Root value={`${brick.def.variant}--${brick.def.layout}-preview`}>
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
                      aria-label={`${brick.def.layout} preview`}
                    >
                      <Tabs.Trigger
                        value={`${brick.def.variant}--${brick.def.layout}-preview`}
                        className="cursor-pointer border-0 bg-transparent p-0 text-sm font-medium text-zinc-950"
                      >
                        {brick.def.label}
                      </Tabs.Trigger>
                    </Tabs.List>
                  </div>
                </div>
                <Tabs.Content value={`${brick.def.variant}--${brick.def.layout}-preview`}>
                  <div className="mt-6 overflow-auto">
                    <div
                      className={
                        brick.def.w === 8
                          ? "qrk-bricks cursor-grab overflow-hidden active:cursor-grabbing"
                          : "qrk-bricks ml-6 cursor-grab overflow-hidden active:cursor-grabbing"
                      }
                      data-brick-full-layout={`${brick.def.collectionName}/${brick.def.variant}/${brick.def.layout}`}
                      data-brick-drawer-brick-slot
                      data-brick-drawer-collection-name={brick.def.collectionName}
                      data-brick-drawer-variant={brick.def.variant}
                      data-brick-drawer-layout={brick.def.layout}
                      draggable
                      onDragStart={(event) => {
                        useBrickDrawerStore
                          .getState()
                          .registerActiveBrickDragGridShape(brick.def.w, brick.def.h);
                        event.dataTransfer.setData(BRICK_DRAG_MIME, JSON.stringify(brick.def));
                        event.dataTransfer.effectAllowed = "copy";
                        event.dataTransfer.setData("text/plain", brick.def.layout);
                      }}
                      onDragEnd={() => {
                        useBrickDrawerStore.getState().unregisterActiveBrickDragGridShape();
                      }}
                      style={{
                        width: `${(brick.def.w / 8) * 100}%`,
                        aspectRatio: `${brick.def.w} / ${brick.def.h}`,
                      }}
                    >
                      <BrickComponent breakpoint={breakpoint} data={variant?.defaultData} />
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
