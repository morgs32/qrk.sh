import { createFileRoute } from "@tanstack/react-router";

import { modulesHash } from "../../../lib/modulesHash";
import { useWallViewport } from "../../../lib/WallViewportProvider";
import { ModulePreview } from "./-ModulePreview";

export const Route = createFileRoute("/modules/")({
  component: ModulesPage,
});

function ModulesPage() {
  const { activeBreakpoint } = useWallViewport();
  const breakpoint = activeBreakpoint ?? "sm";
  const modules = Object.values(modulesHash);

  return (
    <div
      aria-label="Brick modules"
      className="flex h-full min-h-0 w-full min-w-0 flex-row gap-0 overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x touch-pan-y"
    >
      {modules.map((brickModule) => (
        <ModulePreview
          key={brickModule.id}
          brickModule={brickModule}
          breakpoint={breakpoint}
        />
      ))}
    </div>
  );
}
