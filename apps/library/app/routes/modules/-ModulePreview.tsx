import { useCallback, useState } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";

import type { Spec } from "@json-render/core";

import { BrickPreview } from "../../../lib/BrickPreview";
import { BREAKPOINTS } from "../../../lib/breakpoints";
import { modulesHash } from "../../../lib/modulesHash";
import type { IModuleBrickDef } from "../../../lib/types";
import { DraggableBrick } from "../../DraggableBrick";

export function ModulePreview(props: {
  brickModule: (typeof modulesHash)[string];
  breakpoint: (typeof BREAKPOINTS)[number]["id"];
}) {
  const { brickModule, breakpoint } = props;
  const { def, component: BrickComponent, defaultSpec } = brickModule;
  const [measuredUnits, setMeasuredUnits] = useState<{ w: number; h: number }>();
  const onGridUnits = useCallback((size: { w: number; h: number }) => {
    setMeasuredUnits(current => {
      if (current?.w === size.w && current?.h === size.h) return current;
      return size;
    });
  }, []);

  const dragW = measuredUnits?.w ?? 1;
  const dragH = measuredUnits?.h ?? 1;
  const brickDefForDrag: IModuleBrickDef & { spec: Spec; w: number; h: number } = {
    ...def,
    w: dragW,
    h: dragH,
    spec: structuredClone(defaultSpec),
  };
  const exceedsWallWidth = measuredUnits !== undefined && measuredUnits.w > 8;

  const previewBody = (
    <DraggableBrick
      brickDef={brickDefForDrag}
      className="size-full qrk-bricks overflow-hidden"
      data-module-representative={def.moduleId}
    >
      <div className="brick-drag-content size-full">
        <BrickComponent breakpoint={breakpoint} state={def.state} spec={defaultSpec} />
      </div>
    </DraggableBrick>
  );

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
      <div className="pb-16">
        <BrickPreview
          breakpoint={breakpoint}
          measure={<BrickComponent breakpoint={breakpoint} state={def.state} spec={defaultSpec} />}
          onGridUnits={onGridUnits}
        >
          {previewBody}
        </BrickPreview>
      </div>
    </div>
  );
}
