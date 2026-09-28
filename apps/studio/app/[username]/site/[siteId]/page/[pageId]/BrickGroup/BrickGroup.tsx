"use client";

import { useCallback, useState } from "react";

import { modulesHash } from "@qrk.sh/library";
import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";
import { BREAKPOINTS, minGridUnits } from "@qrk.sh/library/breakpoints";
import { GridItemPreview } from "@qrk.sh/library/GridItemPreview";
import { MeasuredBrickWrapper } from "@qrk.sh/library/MeasuredBrickWrapper";
import { brickDragStore } from "@qrk.sh/library/GridStore";
import type { Spec } from "@json-render/core";
import { Schema } from "effect";
import { X } from "lucide-react";
import { Link } from "react-router";
import { useNavigate } from "react-router";
import { href } from "react-router";

import { BRICK_DRAG_MIME } from "@/components/home/useBrickDrawerStore";
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
  const BrickComponent = brickModule.component;
  const view = brickModule.viewFor(breakpoint);
  const [measuredUnits, setMeasuredUnits] = useState<
    Partial<Record<(typeof BREAKPOINTS)[number]["id"], { w: number; h: number }>>
  >({});
  const onSizeChange = useCallback(
    (
      targetBreakpoint: (typeof BREAKPOINTS)[number]["id"],
      dimensions: { widthPx: number; heightPx: number },
    ) => {
      const entry = BREAKPOINTS.find((row) => row.id === targetBreakpoint);
      if (entry === undefined) return;
      const nextW = Math.min(8, minGridUnits(entry.gridItemWidth, dimensions.widthPx));
      const nextH = minGridUnits(entry.gridItemWidth, dimensions.heightPx);
      setMeasuredUnits((current) => {
        const measured = current[targetBreakpoint];
        if (measured?.w === nextW && measured.h === nextH) return current;
        return { ...current, [targetBreakpoint]: { w: nextW, h: nextH } };
      });
    },
    [],
  );

  const sizes = BREAKPOINTS.map((entry) => {
    const entryView = brickModule.viewFor(entry.id);
    return entryView.w !== undefined && entryView.h !== undefined
      ? { w: entryView.w, h: entryView.h }
      : measuredUnits[entry.id];
  });
  const placementSizes =
    sizes[0] && sizes[1] && sizes[2] && sizes[3]
      ? { sm: sizes[0], md: sizes[1], lg: sizes[2], xl: sizes[3] }
      : null;
  const activeSize = placementSizes?.[breakpoint];
  const w = activeSize?.w ?? 1;
  const h = activeSize?.h ?? 1;
  const brickDefForDrag:
    | (typeof brickModule.def & {
        spec: Spec;
        w: number;
        h: number;
        placementSizes: Record<"sm" | "md" | "lg" | "xl", { w: number; h: number }>;
      })
    | null =
    placementSizes === null
      ? null
      : {
          ...brickModule.def,
          w,
          h,
          placementSizes,
          state: structuredClone(brickModule.defaultState),
          spec: structuredClone(view.spec),
        };

  const surface = (
    <div
      className="size-full qrk-bricks brick-drag-surface cursor-grab overflow-hidden active:cursor-grabbing"
      data-module-representative={brickModule.def.moduleId}
      data-brick-drawer-brick-slot
      data-brick-drawer-module-id={brickModule.def.moduleId}
      draggable={brickDefForDrag !== null}
      onDragStart={(event) => {
        if (brickDefForDrag === null) {
          event.preventDefault();
          return;
        }
        brickDragStore.getState().setBrickDef(structuredClone(brickDefForDrag));
        event.dataTransfer.setData(BRICK_DRAG_MIME, JSON.stringify(brickDefForDrag));
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/plain", brickModule.def.moduleId);
      }}
      onDragEnd={() => {
        brickDragStore.getState().setBrickDef(null);
      }}
    >
      <div className="brick-drag-content size-full">
        <BrickComponent breakpoint={breakpoint} state={brickModule.defaultState} spec={view.spec} />
      </div>
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
        <div className={w === 8 ? "relative" : "relative px-4"}>
          <div
            aria-hidden
            className="pointer-events-none absolute overflow-hidden"
            style={{ width: 0, height: 0 }}
          >
            {BREAKPOINTS.map((entry) => {
              const entryView = brickModule.viewFor(entry.id);
              if (entryView.w !== undefined && entryView.h !== undefined) return null;
              return (
                <MeasuredBrickWrapper
                  key={entry.id}
                  onChange={(dimensions) => onSizeChange(entry.id, dimensions)}
                >
                  <BrickComponent
                    breakpoint={entry.id}
                    state={brickModule.defaultState}
                    spec={entryView.spec}
                  />
                </MeasuredBrickWrapper>
              );
            })}
          </div>
          <GridItemPreview breakpoint={breakpoint} w={w} h={h}>
            {surface}
          </GridItemPreview>
        </div>
      </div>
    </section>
  );
}

export function BrickGroup() {
  const { activeBreakpoint } = useWallViewport();
  const breakpoint = activeBreakpoint ?? "sm";
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
