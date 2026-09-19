import { useCallback, useState } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";

import type { Spec } from "@json-render/core";

import { MeasuredBrickWrapper } from "../../../components/brick/MeasuredBrickWrapper";
import { GridItemPreview } from "../../../lib/GridItemPreview";
import { BREAKPOINTS, minGridUnits } from "../../../lib/breakpoints";
import { modulesHash } from "../../../lib/modulesHash";
import type { IModuleBrickDef } from "../../../lib/types";
import { DraggableBrick } from "../../DraggableBrick";

export function ModulePreview(props: {
  brickModule: (typeof modulesHash)[string];
  breakpoint: (typeof BREAKPOINTS)[number]["id"];
}) {
  const { brickModule, breakpoint } = props;
  const { def, component: BrickComponent } = brickModule;
  const view = brickModule.viewFor(breakpoint);
  const spec = view.spec;
  const declaredW = view.w;
  const declaredH = view.h;
  const hasDeclaredSize = declaredW !== undefined && declaredH !== undefined;
  const [measuredUnits, setMeasuredUnits] = useState<{ w: number; h: number }>();
  const onSizeChange = useCallback(
    (dimensions: { widthPx: number; heightPx: number }) => {
      const entry = BREAKPOINTS.find((row) => row.id === breakpoint);
      if (entry === undefined) return;
      const w = minGridUnits(entry.gridItemWidth, dimensions.widthPx);
      const h = minGridUnits(entry.gridItemWidth, dimensions.heightPx);
      setMeasuredUnits((current) => {
        if (current?.w === w && current?.h === h) return current;
        return { w, h };
      });
    },
    [breakpoint],
  );

  const dragW = hasDeclaredSize ? declaredW : (measuredUnits?.w ?? 1);
  const dragH = hasDeclaredSize ? declaredH : (measuredUnits?.h ?? 1);
  const brickDefForDrag: IModuleBrickDef & { spec: Spec; w: number; h: number } = {
    ...def,
    w: dragW,
    h: dragH,
    spec: structuredClone(spec),
  };
  const exceedsWallWidth = hasDeclaredSize
    ? declaredW > 8
    : measuredUnits !== undefined && measuredUnits.w > 8;

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
        {hasDeclaredSize ? null : (
          <div
            aria-hidden
            className="pointer-events-none absolute overflow-hidden"
            style={{ width: 0, height: 0 }}
          >
            <MeasuredBrickWrapper onChange={onSizeChange}>
              <BrickComponent breakpoint={breakpoint} state={def.state} spec={spec} />
            </MeasuredBrickWrapper>
          </div>
        )}
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
