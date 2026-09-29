import { useCallback, useState } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";

import { MeasuredBrickWrapper } from "../../../components/brick/MeasuredBrickWrapper";
import { GridItemPreview } from "../../../lib/GridItemPreview";
import { BREAKPOINTS, minGridUnits } from "../../../lib/breakpoints";
import { modulesHash } from "../../../lib/modulesHash";
import { DraggableBrick } from "../../DraggableBrick";

export function ModulePreview(props: {
  brickModule: (typeof modulesHash)[keyof typeof modulesHash];
  breakpoint: (typeof BREAKPOINTS)[number]["id"];
}) {
  const { brickModule, breakpoint } = props;
  const { def, component: BrickComponent } = brickModule;
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
        : { w: Math.min(8, measured.w), h: measured.h };
  });
  const placementSizes =
    sizes[0] && sizes[1] && sizes[2] && sizes[3]
      ? { sm: sizes[0], md: sizes[1], lg: sizes[2], xl: sizes[3] }
      : null;
  const activeSize = placementSizes?.[breakpoint];
  const dragW = activeSize?.w ?? 1;
  const dragH = activeSize?.h ?? 1;
  const brickDefForDrag =
    placementSizes === null
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
        "flex h-full min-h-0 w-max shrink-0 flex-col overflow-y-auto overscroll-y-contain px-8",
        exceedsWallWidth ? "border border-red-200 bg-red-50" : "border-r border-zinc-200",
      )}
    >
      <h2 className="m-0 shrink-0 py-4 font-normal">
        <Link
          to="/modules/$moduleId"
          params={{ moduleId: brickModule.id }}
          data-module-link={brickModule.id}
        >
          {brickModule.label}
        </Link>
      </h2>
      <div className="relative pb-16">
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
            className="size-full qrk-bricks overflow-hidden"
            data-module-representative={def.moduleId}
          >
            <div className="brick-drag-content size-full">
              <BrickComponent breakpoint={breakpoint} state={def.state} spec={spec} />
            </div>
          </DraggableBrick>
        </GridItemPreview>
      </div>
    </div>
  );
}
