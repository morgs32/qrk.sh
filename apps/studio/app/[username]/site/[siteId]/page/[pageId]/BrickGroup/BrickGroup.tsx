"use client";

import { modulesHash } from "@qrk.sh/library";
import { useBrickBreakpoint } from "@qrk.sh/library/BrickBreakpointProvider";
import { BrickPreview } from "@qrk.sh/library/BrickPreview";
import { Schema } from "effect";
import { X } from "lucide-react";
import { Link } from "react-router";
import { useNavigate } from "react-router";
import { href } from "react-router";

import { BRICK_DRAG_MIME } from "@/components/home/useBrickDrawerStore";
import { useGridStoreApi } from "@qrk.sh/library/GridStore";
import { Button } from "@/components/ui/button";
import { useValidatedParams } from "@/hooks/useValidatedParams";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: Schema.String,
});

export function BrickGroup() {
  const { breakpoint } = useBrickBreakpoint();
  const params = useValidatedParams(ParamsSchema);
  const navigate = useNavigate();
  const gridStore = useGridStoreApi();
  const modules = Object.values(modulesHash);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col gap-4 border-b border-border/60 bg-background/95 px-6 pb-5 pt-6 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm">Bricks</div>
            <div className="text-xs text-muted-foreground">
              Browse bricks by module. Drag a brick onto your page.
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="cursor-pointer"
            aria-label="Close drawer"
            onClick={() => navigate(href("/:username/site/:siteId/page/:pageId", { ...params }))}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div
        aria-label="Brick modules"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-zinc-100 pb-16 font-mono text-sm leading-5 text-zinc-900"
      >
        {modules.map((brickModule) => {
          const selectedBrick = brickModule;
          const BrickComponent = selectedBrick.component;
          const w = selectedBrick.def[breakpoint].w;
          const h = selectedBrick.def[breakpoint].h;

          return (
            <section key={brickModule.id} data-module-entry={brickModule.id}>
              <h2 className="m-0 shrink-0 sticky top-0 z-10 bg-zinc-100 px-4 py-4 text-sm font-normal">
                <Link
                  to={href("/:username/site/:siteId/page/:pageId/brick-group/:groupName", {
                    ...params,
                    groupName: brickModule.id,
                  })}
                  data-module-link={brickModule.id}
                >
                  {brickModule.label}
                </Link>
              </h2>
              <div className="overflow-auto py-6">
                <div className={w === 8 ? undefined : "px-4"}>
                  <BrickPreview w={w} h={h}>
                    <div
                      className="size-full qrk-bricks cursor-grab overflow-hidden active:cursor-grabbing"
                      data-module-representative={selectedBrick.def.moduleId}
                      data-brick-drawer-brick-slot
                      data-brick-drawer-module-id={selectedBrick.def.moduleId}
                      draggable
                      onDragStart={(event) => {
                        gridStore.getState().setActiveBrickDrag(structuredClone(selectedBrick.def));
                        event.dataTransfer.setData(
                          BRICK_DRAG_MIME,
                          JSON.stringify(selectedBrick.def),
                        );
                        event.dataTransfer.effectAllowed = "copy";
                        event.dataTransfer.setData("text/plain", selectedBrick.def.moduleId);
                      }}
                      onDragEnd={() => {
                        gridStore.getState().setActiveBrickDrag(null);
                      }}
                    >
                      <BrickComponent breakpoint={breakpoint} data={brickModule.defaultData} />
                    </div>
                  </BrickPreview>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
