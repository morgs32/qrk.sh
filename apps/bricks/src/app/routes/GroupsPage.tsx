import { useState } from "react";

import { Pencil } from "lucide-react";
import { Link } from "react-router";

import { useBrickBreakpoint } from "../../BrickBreakpointProvider";
import { BrickPreviewFrame } from "../../BrickPreviewFrame";
import { groupsHash } from "../../groupsHash";
import { Outline } from "../../Outline";
import { Button } from "../../ui/button";
import { GroupOutline } from "../GroupOutline";
import { DraggableBrick } from "../DraggableBrick";

export default function GroupsPage() {
  const { breakpoint } = useBrickBreakpoint();
  const groups = Object.values(groupsHash);
  const [selectedCatalogs, setSelectedCatalogs] = useState<Record<string, string>>({});

  return (
    <div aria-label="Brick groups" className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-16">
        {groups.map((group) => {
          const catalogs = Object.entries(group.catalogs);
          const firstCatalogEntry = catalogs[0];

          if (!firstCatalogEntry) {
            return null;
          }

          const [firstCatalogName, firstCatalog] = firstCatalogEntry;
          const selectedCatalogName = selectedCatalogs[group.groupName] ?? firstCatalogName;
          const selectedCatalog = group.catalogs[selectedCatalogName] ?? firstCatalog;
          const { def, component: BrickComponent } = selectedCatalog;

          return (
            <div key={group.groupName} data-group-entry={group.groupName}>
              <Outline.Title sticky>
                <Link
                  to={`/groups/${encodeURIComponent(group.groupName)}`}
                  data-group-link={group.groupName}
                >
                  {group.groupLabel}
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
                        [group.groupName]: catalogName,
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
                      data-group-representative={`${def.groupName}/${def.catalog}`}
                    >
                      <div className="brick-drag-content size-full">
                        <BrickComponent breakpoint={breakpoint} data={def.data} />
                      </div>
                      <Button asChild variant="ghost" size="icon" className="brick-edit-handle">
                        <Link
                          aria-label="Configure catalog"
                          to={`/groups/${encodeURIComponent(def.groupName)}?catalog=${encodeURIComponent(def.catalog)}`}
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
