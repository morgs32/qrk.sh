import { Link } from "react-router";

import { useBrickBreakpoint } from "../../components/brick/BrickBreakpointProvider";
import { BrickPreviewFrame } from "../../components/brick/BrickPreviewFrame";
import { modulesHash } from "../../modulesHash";
import { DraggableBrick } from "../DraggableBrick";

export default function ModulesPage() {
  const { breakpoint } = useBrickBreakpoint();
  const modules = Object.values(modulesHash);

  return (
    <div
      aria-label="Brick modules"
      className="flex h-full min-h-0 w-full min-w-0 flex-row gap-0 overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x touch-pan-y"
    >
      {modules.map((brickModule) => {
        const { def, component: BrickComponent } = brickModule;

        return (
          <div
            key={brickModule.id}
            data-module-entry={brickModule.id}
            className="flex h-full min-h-0 w-max shrink-0 flex-col overflow-y-auto overscroll-y-contain border-r border-zinc-200 pb-16"
          >
            <h2 className="m-0 shrink-0 sticky top-0 z-10 bg-zinc-100 px-4 py-4 text-sm font-normal">
              <Link
                to={`/modules/${encodeURIComponent(brickModule.id)}`}
                data-module-link={brickModule.id}
              >
                {brickModule.label}
              </Link>
            </h2>
            <div className="overflow-auto py-6">
              <div className={def[breakpoint].w === 8 ? undefined : "px-4"}>
                <BrickPreviewFrame w={def[breakpoint].w} h={def[breakpoint].h}>
                  <DraggableBrick
                    brickDef={def}
                    className="size-full qrk-bricks overflow-hidden"
                    data-module-representative={def.moduleId}
                  >
                    <div className="brick-drag-content size-full">
                      <BrickComponent breakpoint={breakpoint} data={def.data} />
                    </div>
                  </DraggableBrick>
                </BrickPreviewFrame>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
