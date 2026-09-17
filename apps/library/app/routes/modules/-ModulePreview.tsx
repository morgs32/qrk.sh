import { Link } from "@tanstack/react-router";

import { BrickPreview } from "../../../lib/BrickPreview";
import { BREAKPOINTS } from "../../../lib/breakpoints";
import { modulesHash } from "../../../lib/modulesHash";
import { DraggableBrick } from "../../DraggableBrick";

export function ModulePreview(props: {
  brickModule: (typeof modulesHash)[string];
  breakpoint: (typeof BREAKPOINTS)[number]["id"];
}) {
  const { brickModule, breakpoint } = props;
  const { def, component: BrickComponent, breakpoints } = brickModule;

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
        {breakpoints[breakpoint].measurable ? (
          <BrickPreview
            breakpoint={breakpoint}
            measure={<BrickComponent breakpoint={breakpoint} data={def.data} />}
            w={def[breakpoint].w}
            h={def[breakpoint].h}
          >
            <DraggableBrick
              brickDef={def}
              className="size-full qrk-bricks overflow-hidden"
              data-module-representative={def.moduleId}
            >
              <div className="brick-drag-content size-full">
                <BrickComponent breakpoint={breakpoint} data={def.data} />
              </div>
            </DraggableBrick>
          </BrickPreview>
        ) : (
          <BrickPreview w={def[breakpoint].w} h={def[breakpoint].h}>
            <DraggableBrick
              brickDef={def}
              className="size-full qrk-bricks overflow-hidden"
              data-module-representative={def.moduleId}
            >
              <div className="brick-drag-content size-full">
                <BrickComponent breakpoint={breakpoint} data={def.data} />
              </div>
            </DraggableBrick>
          </BrickPreview>
        )}
      </div>
    </div>
  );
}
