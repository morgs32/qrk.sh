"use client";

import Link from "next/link";

import { ModuleFilmstrip } from "../../lib/ModuleFilmstrip";
import { useWallViewport } from "../../lib/WallViewportProvider";

export default function ModulesPage() {
  const { activeBreakpoint, displayPlaceholders } = useWallViewport();
  const breakpoint = activeBreakpoint ?? "sm";

  return (
    <ModuleFilmstrip
      breakpoint={breakpoint}
      displayPlaceholders={displayPlaceholders}
      renderModuleLink={(brickModule) => (
        <Link href={`/modules/${brickModule.id}`} scroll={false} data-module-link={brickModule.id}>
          {brickModule.label}
        </Link>
      )}
    />
  );
}
