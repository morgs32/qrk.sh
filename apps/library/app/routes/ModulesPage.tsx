import { Pencil } from "lucide-react";
import { Link } from "react-router";

import { useBrickBreakpoint } from "../../BrickBreakpointProvider";
import { BrickPreviewFrame } from "../../BrickPreviewFrame";
import { modulesHash } from "../../modulesHash";
import { Outline } from "../../components/outline/Outline";
import { Button } from "../../components/ui/button";
import { DraggableBrick } from "../DraggableBrick";

export default function ModulesPage() {
  const { breakpoint } = useBrickBreakpoint();
  const modules = Object.values(modulesHash);

  return (
    <div
      aria-label="Brick modules"
      className="flex h-full min-h-0 flex-row gap-0 overflow-x-auto overflow-y-hidden overscroll-x-contain"
    >
      {modules.map((module) => {
        const { def, component: BrickComponent } = module;

        return (
          <div
            key={module.id}
            data-module-entry={module.id}
            className="flex h-full min-h-0 w-[min(100%,20rem)] shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-zinc-200"
          >
            <Outline.Title sticky>
              <Link to={`/modules/${encodeURIComponent(module.id)}`} data-module-link={module.id}>
                {module.label}
              </Link>
            </Outline.Title>
            <Outline>
              <Outline.List padded={false} spaced>
                <Outline.Item>
                  <Outline.Label>
                    <span className="text-zinc-950">{module.label}</span>
                  </Outline.Label>
                </Outline.Item>
              </Outline.List>
            </Outline>
            <div className="overflow-auto bg-white py-6">
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
                    <Button asChild variant="ghost" size="icon" className="brick-edit-handle">
                      <Link
                        aria-label="Configure module"
                        to={`/modules/${encodeURIComponent(def.moduleId)}`}
                      >
                        <Pencil aria-hidden className="size-4" />
                      </Link>
                    </Button>
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
