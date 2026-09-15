"use client";

import { modulesHash } from "@qrk.sh/library";
import { useBrickBreakpoint } from "@qrk.sh/library/BrickBreakpointProvider";
import { Schema } from "effect";
import { X } from "lucide-react";
import { Link } from "react-router";
import { useNavigate } from "react-router";
import { href } from "react-router";

import { BRICK_DRAG_MIME, useBrickDrawerStore } from "@/components/home/useBrickDrawerStore";
import { Button } from "@/components/ui/button";
import { Outline } from "@/components/home/outline/Outline";
import { useValidatedParams } from "@/hooks/useValidatedParams";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: Schema.String,
});

/** Bottom drawer is ~half viewport; list previews cap at half of that (quarter screen). */
const PREVIEW_MAX_HEIGHT = "25vh";
const PREVIEW_GRID_COLS = 8;

export function BrickGroup() {
  const { breakpoint, gridWidth } = useBrickBreakpoint();
  const params = useValidatedParams(ParamsSchema);
  const navigate = useNavigate();
  const modules = Object.values(modulesHash);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col gap-4 border-b border-border/60 bg-background/95 px-6 pb-5 pt-6 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm font-semibold">Bricks</div>
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
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white pb-16 font-mono text-sm leading-5 text-zinc-900"
      >
        {modules.map((module) => {
          const selectedBrick = module;
          const BrickComponent = selectedBrick.component;
          const w = selectedBrick.def[breakpoint].w;
          const h = selectedBrick.def[breakpoint].h;
          const fullW = Math.round((gridWidth / PREVIEW_GRID_COLS) * w);
          const fullH = Math.round((gridWidth / PREVIEW_GRID_COLS) * h);

          return (
            <section key={module.id} data-module-entry={module.id}>
              <Outline.Title sticky>
                <Link
                  to={href("/:username/site/:siteId/page/:pageId/brick-group/:groupName", {
                    ...params,
                    groupName: module.id,
                  })}
                  data-module-link={module.id}
                >
                  {module.label}
                </Link>
              </Outline.Title>
              <Outline>
                <Outline.List padded={false} spaced>
                  <Outline.Item>
                    <Outline.Label>
                      <span className="text-zinc-950">{module.label}</span>
                    </Outline.Label>
                  </Outline.Item>
                </Outline.List>
              </Outline>
              <div className="overflow-auto bg-white py-6">
                <div className={w === 8 ? undefined : "px-4"}>
                  <div
                    className="shrink-0"
                    style={{
                      width: `min(${fullW}px, calc(${w} * ${PREVIEW_MAX_HEIGHT} / ${h}))`,
                      height: `min(${fullH}px, ${PREVIEW_MAX_HEIGHT})`,
                    }}
                  >
                    <div
                      className="size-full qrk-bricks cursor-grab overflow-hidden active:cursor-grabbing"
                      data-module-representative={selectedBrick.def.moduleId}
                      data-brick-drawer-brick-slot
                      data-brick-drawer-module-id={selectedBrick.def.moduleId}
                      draggable
                      onDragStart={(event) => {
                        useBrickDrawerStore.getState().registerActiveBrickDragGridShape(w, h);
                        event.dataTransfer.setData(
                          BRICK_DRAG_MIME,
                          JSON.stringify(selectedBrick.def),
                        );
                        event.dataTransfer.effectAllowed = "copy";
                        event.dataTransfer.setData("text/plain", selectedBrick.def.moduleId);
                      }}
                      onDragEnd={() => {
                        useBrickDrawerStore.getState().unregisterActiveBrickDragGridShape();
                      }}
                    >
                      <BrickComponent breakpoint={breakpoint} data={module.defaultData} />
                    </div>
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
