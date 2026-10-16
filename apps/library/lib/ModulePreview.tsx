import { useCallback, useState, type ReactNode } from "react";
import { cn } from "cn";

import { MeasuredBrickWrapper } from "../components/brick/MeasuredBrickWrapper";
import { GridItemPreview } from "./GridItemPreview";
import { BREAKPOINTS, minGridUnits } from "./breakpoints";
import { modulesHash } from "./modulesHash";
import { DraggableBrick } from "./DraggableBrick";

export function ModulePreview(props: {
  brickModule: (typeof modulesHash)[keyof typeof modulesHash];
  breakpoint: (typeof BREAKPOINTS)[number]["id"];
  displayPlaceholders: boolean;
  moduleCount: number;
  moduleLink: ReactNode;
}) {
  const { brickModule, breakpoint, displayPlaceholders, moduleCount, moduleLink } = props;
  const { def, component: BrickComponent } = brickModule;
  const maxPerPage = brickModule.maxPerPage;
  const limitReached = maxPerPage !== undefined && moduleCount >= maxPerPage;
  const view = brickModule.viewFor(breakpoint);
  const spec = view.spec;
  const declaredW = view.w;
  const declaredH = view.h;
  const hasDeclaredSize = declaredW !== undefined && declaredH !== undefined;
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
      const w = minGridUnits(entry.gridItemWidth, dimensions.widthPx);
      const h = minGridUnits(entry.gridItemWidth, dimensions.heightPx);
      setMeasuredUnits((current) => {
        const measured = current[targetBreakpoint];
        if (measured?.w === w && measured.h === h) return current;
        return { ...current, [targetBreakpoint]: { w, h } };
      });
    },
    [],
  );

  const sizes = BREAKPOINTS.map((entry) => {
    const entryView = brickModule.viewFor(entry.id);
    const measured = measuredUnits[entry.id];
    return entryView.w !== undefined && entryView.h !== undefined
      ? { w: entryView.w, h: entryView.h }
      : measured === undefined
        ? undefined
        : {
            w: Math.min(8, Math.max(measured.w, entryView.minW ?? 1)),
            h: Math.max(measured.h, entryView.minH ?? 1),
          };
  });
  const placementSizes =
    sizes[0] && sizes[1] && sizes[2] && sizes[3]
      ? { sm: sizes[0], md: sizes[1], lg: sizes[2], xl: sizes[3] }
      : null;
  const activeSize = placementSizes?.[breakpoint];
  const dragW = activeSize?.w ?? view.minW ?? 1;
  const dragH = activeSize?.h ?? view.minH ?? 1;
  const brickDefForDrag =
    placementSizes === null || limitReached
      ? null
      : {
          ...def,
          w: dragW,
          h: dragH,
          placementSizes,
          spec: structuredClone(spec),
        };
  const exceedsWallWidth = hasDeclaredSize
    ? declaredW > 8
    : measuredUnits[breakpoint] !== undefined && measuredUnits[breakpoint].w > 8;

  return (
    <div
      data-module-entry={brickModule.id}
      className={cn(
        "flex h-full min-h-0 w-max shrink-0 flex-col overflow-y-auto overscroll-y-contain",
        exceedsWallWidth
          ? "border border-red-200 bg-red-50"
          : "border-r border-zinc-200 bg-zinc-100",
      )}
    >
      <h2 className="sticky top-0 z-10 m-0 shrink-0 bg-inherit px-8 py-4 font-normal">
        {moduleLink}
      </h2>
      <div className="relative px-8 pb-16">
        {maxPerPage !== undefined ? (
          <p className="mb-3 mt-0 max-w-64 text-sm text-zinc-500">
            Limit: {maxPerPage} per page.
            {limitReached ? " Limit reached. Remove one to add another." : ""}
          </p>
        ) : null}
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
                <BrickComponent breakpoint={entry.id} state={def.state} spec={entryView.spec} />
              </MeasuredBrickWrapper>
            );
          })}
        </div>
        <GridItemPreview breakpoint={breakpoint} w={dragW} h={dragH}>
          <DraggableBrick
            brickDef={brickDefForDrag}
            aria-disabled={limitReached}
            title={limitReached ? "Limit reached. Remove one to add another." : undefined}
            className="size-full qrk-bricks overflow-hidden"
            data-module-representative={def.moduleId}
            data-brick-drawer-brick-slot
            data-brick-drawer-module-id={def.moduleId}
          >
            <div className="brick-drag-content size-full">
              <BrickComponent
                breakpoint={breakpoint}
                state={
                  displayPlaceholders && brickModule.placeholder !== undefined ? null : def.state
                }
                spec={spec}
              />
            </div>
          </DraggableBrick>
        </GridItemPreview>
      </div>
    </div>
  );
}
