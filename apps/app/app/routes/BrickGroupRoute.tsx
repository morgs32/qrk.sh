import { groupsHash } from "@qrk.sh/bricks";
import { useBrickBreakpoint } from "@qrk.sh/bricks/BrickBreakpointProvider";
import { BrickPreviewFrame } from "@qrk.sh/bricks/BrickPreviewFrame";
import { ArrowLeft } from "lucide-react";
import { Tabs } from "radix-ui";
import { href, Link, useParams } from "react-router";

import { CodeText } from "../[username]/site/[siteId]/page/[pageId]/BrickGroup/CodeText";
import { MetadataField } from "../[username]/site/[siteId]/page/[pageId]/BrickGroup/MetadataField";

import { BRICK_DRAG_MIME, useBrickDrawerStore } from "@/components/home/useBrickDrawerStore";

export default function BrickGroupRoute() {
  const { breakpoint } = useBrickBreakpoint();
  const params = useParams();
  const { username, siteId, pageId } = params;
  if (!username || !siteId || !pageId) throw new Error("Missing editor route params");
  const { groupName } = params;

  const group = Object.values(groupsHash).find((candidate) => candidate.groupName === groupName);

  if (!group) {
    return (
      <div className="p-6" data-testid="group-not-found">
        <h1>Group not found</h1>
        <Link
          to={href("/:username/site/:siteId/page/:pageId/brick-group", {
            username,
            siteId,
            pageId,
          })}
        >
          All groups
        </Link>
      </div>
    );
  }

  const bricks = Object.values(group.catalogs);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-6">
      <div className="px-6 pt-6">
        <Link
          to={href("/:username/site/:siteId/page/:pageId/brick-group", {
            username,
            siteId,
            pageId,
          })}
          className="inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft aria-hidden className="size-4" />
          <span>All groups</span>
        </Link>
        <dl className="mt-5 grid max-w-[500px] grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <MetadataField label="Group name">{group.groupLabel}</MetadataField>
          <MetadataField label="Group ID" className="text-right">
            <CodeText>{group.groupName}</CodeText>
          </MetadataField>
          <MetadataField label="Group description" className="col-span-2">
            {group.groupDescription}
          </MetadataField>
        </dl>
      </div>
      <div className="mt-8 flex flex-col gap-10">
        {bricks.map((brick) => {
          const BrickComponent = brick.component;
          const content = group.catalogs[brick.def.catalog];

          return (
            <section key={`${brick.def.catalog}`}>
              <Tabs.Root value={`${brick.def.catalog}-preview`}>
                <div className="flex items-baseline justify-between gap-4 px-6">
                  <div>
                    <h2 className="m-0 text-2xl font-semibold">{brick.def.catalog}</h2>
                    <p className="mb-0 mt-1 text-sm text-zinc-500">
                      {group.catalogs[brick.def.catalog]?.catalogDescription}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-baseline gap-2">
                    <Tabs.List
                      className="flex gap-2 text-sm"
                      aria-label={`${brick.def.catalog} preview`}
                    >
                      <Tabs.Trigger
                        value={`${brick.def.catalog}-preview`}
                        className="cursor-pointer border-0 bg-transparent p-0 text-sm font-medium text-zinc-950"
                      >
                        {brick.def.label}
                      </Tabs.Trigger>
                    </Tabs.List>
                  </div>
                </div>
                <Tabs.Content value={`${brick.def.catalog}-preview`}>
                  <div className="mt-6 overflow-auto">
                    <div className={brick.def[breakpoint].w === 8 ? undefined : "ml-6"}>
                      <BrickPreviewFrame w={brick.def[breakpoint].w} h={brick.def[breakpoint].h}>
                        <div
                          className="size-full qrk-bricks cursor-grab overflow-hidden active:cursor-grabbing"
                          data-brick-full-view={`${brick.def.groupName}/${brick.def.catalog}`}
                          data-brick-drawer-brick-slot
                          data-brick-drawer-group-name={brick.def.groupName}
                          data-brick-drawer-catalog={brick.def.catalog}
                          draggable
                          onDragStart={(event) => {
                            useBrickDrawerStore
                              .getState()
                              .registerActiveBrickDragGridShape(
                                brick.def[breakpoint].w,
                                brick.def[breakpoint].h,
                              );
                            event.dataTransfer.setData(BRICK_DRAG_MIME, JSON.stringify(brick.def));
                            event.dataTransfer.effectAllowed = "copy";
                            event.dataTransfer.setData("text/plain", brick.def.catalog);
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
