import { useCallback, useState, type ReactNode } from "react";
import { cn } from "cn";

import { MeasuredBrickWrapper } from "../components/brick/MeasuredBrickWrapper";
import { GridItemPreview } from "./GridItemPreview";
import { BREAKPOINTS, minGridUnits } from "./breakpoints";
import { modulesHash } from "./modulesHash";

export function ModulePreview(props: {
  brickModule: (typeof modulesHash)[keyof typeof modulesHash];
  breakpoint: (typeof BREAKPOINTS)[number]["id"];
  displayPlaceholders: boolean;
  moduleLink: ReactNode;
}) {
  const { brickModule, breakpoint, displayPlaceholders, moduleLink } = props;
  const { def, component: BrickComponent } = brickModule;
  const maxPerPage = brickModule.maxPerPage;
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

  const measured = measuredUnits[breakpoint];
  const previewW = hasDeclaredSize
    ? declaredW
    : Math.min(8, Math.max(measured?.w ?? 1, view.minW ?? 1));
  const previewH = hasDeclaredSize ? declaredH : Math.max(measured?.h ?? 1, view.minH ?? 1);
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
          <p className="mb-3 mt-0 max-w-64 text-sm text-zinc-500">Limit: {maxPerPage} per page.</p>
        ) : null}
        <div
          aria-hidden
          className="pointer-events-none absolute overflow-hidden"
          style={{ width: 0, height: 0 }}
        >
          {hasDeclaredSize ? null : (
            <MeasuredBrickWrapper onChange={(dimensions) => onSizeChange(breakpoint, dimensions)}>
              <BrickComponent breakpoint={breakpoint} state={def.state} spec={spec} />
            </MeasuredBrickWrapper>
          )}
        </div>
        <GridItemPreview breakpoint={breakpoint} w={previewW} h={previewH}>
          <div
            className="size-full qrk-bricks overflow-hidden"
            data-module-representative={def.moduleId}
          >
            <BrickComponent
              breakpoint={breakpoint}
              state={
                displayPlaceholders && brickModule.placeholder !== undefined ? null : def.state
              }
              spec={spec}
            />
          </div>
        </GridItemPreview>
      </div>
    </div>
  );
}
