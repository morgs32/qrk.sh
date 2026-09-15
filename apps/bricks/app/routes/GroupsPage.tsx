import { useState } from "react";

import { Pencil } from "lucide-react";
import { Link } from "react-router";

import { useBrickBreakpoint } from "../../BrickBreakpointProvider";
import { BrickPreviewFrame } from "../../BrickPreviewFrame";
import { groupsHash } from "../../groupsHash";
import { Outline } from "../../components/outline/Outline";
import { Button } from "../../components/ui/button";
import { GroupOutline } from "../../components/outline/GroupOutline";
import { DraggableBrick } from "../DraggableBrick";

export default function GroupsPage() {
  const { breakpoint } = useBrickBreakpoint();
  const groups = Object.values(groupsHash);
  const [selectedCatalogs, setSelectedCatalogs] = useState<Record<string, string>>({});

  return (
    <div
      aria-label="Brick groups"
      className="flex h-full min-h-0 flex-row gap-0 overflow-x-auto overflow-y-hidden overscroll-x-contain"
    >
      {groups.map((group) => {
        const catalogs = Object.entries(group.catalogs);
        const firstCatalogEntry = catalogs[0];

        if (!firstCatalogEntry) {
          return null;
        }

        const [firstCatalogName, firstCatalog] = firstCatalogEntry;
        const selectedCatalogName = selectedCatalogs[group.id] ?? firstCatalogName;
        const selectedCatalog = group.catalogs[selectedCatalogName] ?? firstCatalog;
        const { def, component: BrickComponent } = selectedCatalog;

        return (
          <div
            key={group.id}
            data-group-entry={group.id}
            className="flex h-full min-h-0 w-[min(100%,20rem)] shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-zinc-200"
          >
            <Outline.Title sticky>
              <Link to={`/groups/${encodeURIComponent(group.id)}`} data-group-link={group.id}>
                {group.label}
              </Link>
            </Outline.Title>
            <GroupOutline
              group={group}
              renderCatalog={(catalogName, label) => (
                <Button
                  variant="link"
                  aria-pressed={selectedCatalogName === catalogName}
                  onClick={() => {
                    setSelectedCatalogs((current) => ({
                      ...current,
                      [group.id]: catalogName,
                    }));
                  }}
                  className="h-auto rounded-none p-0 font-normal leading-inherit text-zinc-500 underline aria-pressed:text-zinc-950 aria-pressed:no-underline"
                >
                  {label}
                </Button>
              )}
            />
            <div className="overflow-auto bg-white py-6">
              <div className={def[breakpoint].w === 8 ? undefined : "px-4"}>
                <BrickPreviewFrame w={def[breakpoint].w} h={def[breakpoint].h}>
                  <DraggableBrick
                    brickDef={def}
                    className="size-full qrk-bricks overflow-hidden"
                    data-group-representative={`${def.groupId}/${def.catalogId}`}
                  >
                    <div className="brick-drag-content size-full">
                      <BrickComponent breakpoint={breakpoint} data={def.data} />
                    </div>
                    <Button asChild variant="ghost" size="icon" className="brick-edit-handle">
                      <Link
                        aria-label="Configure catalog"
                        to={`/groups/${encodeURIComponent(def.groupId)}?catalog=${encodeURIComponent(def.catalogId)}`}
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
  );
}
