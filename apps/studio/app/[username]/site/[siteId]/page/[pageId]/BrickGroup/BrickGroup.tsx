"use client";

import { useCallback, useState } from "react";

import { modulesHash } from "@qrk.sh/library";
import { useBrickBreakpoint } from "@qrk.sh/library/BrickBreakpointProvider";
import { BrickPreview } from "@qrk.sh/library/BrickPreview";
import type { IModuleBrickDef } from "@qrk.sh/library";
import { Schema } from "effect";
import { X } from "lucide-react";
import { Link } from "react-router";
import { useNavigate } from "react-router";
import { href } from "react-router";

import { BRICK_DRAG_MIME } from "@/components/home/useBrickDrawerStore";
import { useBricksStoreApi } from "@qrk.sh/library/GridStore";
import { Button } from "@/components/ui/button";
import { useValidatedParams } from "@/hooks/useValidatedParams";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: Schema.String,
});

function BrickGroupModulePreview(props: {
  brickModule: (typeof modulesHash)[string];
  breakpoint: "sm" | "md" | "lg" | "xl";
  params: { username: string; siteId: string; pageId: string };
}) {
  const { brickModule, breakpoint, params } = props;
  const bricksStore = useBricksStoreApi();
  const BrickComponent = brickModule.component;
  const declared = brickModule.def[breakpoint];
  const declaredW = declared.w;
  const declaredH = declared.h;
  const hasDeclaredSize = declaredW !== undefined && declaredH !== undefined;
  const [measuredUnits, setMeasuredUnits] = useState<{ w: number; h: number }>();
  const onGridUnits = useCallback((size: { w: number; h: number }) => {
    setMeasuredUnits((current) => {
      if (current?.w === size.w && current?.h === size.h) return current;
      return size;
    });
  }, []);

  const w = hasDeclaredSize ? declaredW : (measuredUnits?.w ?? 1);
  const h = hasDeclaredSize ? declaredH : (measuredUnits?.h ?? 1);
  const brickDefForDrag: IModuleBrickDef = {
    ...brickModule.def,
    [breakpoint]: { w, h },
  };

  const surface = (
    <div
      className="size-full qrk-bricks cursor-grab overflow-hidden active:cursor-grabbing"
      data-module-representative={brickModule.def.moduleId}
      data-brick-drawer-brick-slot
      data-brick-drawer-module-id={brickModule.def.moduleId}
      draggable
      onDragStart={(event) => {
        bricksStore.getState().setActiveBrickDrag(structuredClone(brickDefForDrag));
        event.dataTransfer.setData(BRICK_DRAG_MIME, JSON.stringify(brickDefForDrag));
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/plain", brickModule.def.moduleId);
      }}
      onDragEnd={() => {
        bricksStore.getState().setActiveBrickDrag(null);
      }}
    >
      <BrickComponent breakpoint={breakpoint} data={brickModule.defaultData} />
    </div>
  );

  return (
    <section data-module-entry={brickModule.id}>
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
          {hasDeclaredSize ? (
            <BrickPreview w={declaredW} h={declaredH}>
              {surface}
            </BrickPreview>
          ) : (
            <BrickPreview
              breakpoint={breakpoint}
              measure={<BrickComponent breakpoint={breakpoint} data={brickModule.defaultData} />}
              onGridUnits={onGridUnits}
            >
              {surface}
            </BrickPreview>
          )}
        </div>
      </div>
    </section>
  );
}

export function BrickGroup() {
  const { breakpoint } = useBrickBreakpoint();
  const params = useValidatedParams(ParamsSchema);
  const navigate = useNavigate();
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
        {modules.map((brickModule) => (
          <BrickGroupModulePreview
            key={brickModule.id}
            brickModule={brickModule}
            breakpoint={breakpoint}
            params={params}
          />
        ))}
      </div>
    </div>
  );
}
