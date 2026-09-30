import { createFileRoute, Link } from "@tanstack/react-router";

import { ModuleFilmstrip } from "../../../lib/ModuleFilmstrip";
import { useWallViewport } from "../../../lib/WallViewportProvider";

export const Route = createFileRoute("/modules/")({
  component: ModulesPage,
});

function ModulesPage() {
  const { activeBreakpoint, displayPlaceholders } = useWallViewport();
  const breakpoint = activeBreakpoint ?? "sm";

  return (
    <ModuleFilmstrip
      breakpoint={breakpoint}
      displayPlaceholders={displayPlaceholders}
      renderModuleLink={(brickModule) => (
        <Link
          to="/modules/$moduleId"
          params={{ moduleId: brickModule.id }}
          data-module-link={brickModule.id}
        >
          {brickModule.label}
        </Link>
      )}
    />
  );
}
