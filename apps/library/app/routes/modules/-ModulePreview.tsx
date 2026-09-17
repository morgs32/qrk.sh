import { useCallback, useState } from "react";
import { Link } from "@tanstack/react-router";

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
  const { def, component: BrickComponent } = brickModule;
  const declared = def[breakpoint];
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

  const brickDefForDrag: IModuleBrickDef = {
    ...def,
    [breakpoint]: hasDeclaredSize
      ? { w: declaredW, h: declaredH }
      : measuredUnits !== undefined
        ? { w: measuredUnits.w, h: measuredUnits.h }
        : { w: 1, h: 1 },
  };

  const previewBody = (
    <DraggableBrick
      brickDef={brickDefForDrag}
      className="size-full qrk-bricks overflow-hidden"
      data-module-representative={def.moduleId}
    >
      <div className="brick-drag-content size-full">
        <BrickComponent breakpoint={breakpoint} data={def.data} />
      </div>
    </DraggableBrick>
  );

  return (
    <div
      data-module-entry={brickModule.id}
      className="flex h-full min-h-0 w-max shrink-0 flex-col overflow-y-auto overscroll-y-contain border-r border-zinc-200 px-8"
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
        {hasDeclaredSize ? (
          <BrickPreview breakpoint={breakpoint} w={declaredW} h={declaredH}>
            {previewBody}
          </BrickPreview>
        ) : (
          <BrickPreview
            breakpoint={breakpoint}
            measure={<BrickComponent breakpoint={breakpoint} data={def.data} />}
            onGridUnits={onGridUnits}
          >
            {previewBody}
          </BrickPreview>
        )}
      </div>
    </div>
  );
}
