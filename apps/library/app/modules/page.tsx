"use client";

import { Link } from "@tanstack/react-router";
import { useLiveQuery } from "@zerospin/react";

import { ModuleFilmstrip } from "../../lib/ModuleFilmstrip";
import { useWallViewport } from "../../lib/WallViewportProvider";
import { useLibrarySession } from "../../session/createLibraryStandaloneSession";
import { librarySessionInputs } from "../librarySession";

export default function ModulesPage() {
  const { activeBreakpoint, displayPlaceholders } = useWallViewport();
  const breakpoint = activeBreakpoint ?? "sm";
  const session = useLibrarySession();
  const bricksQuery = useLiveQuery({
    session,
    query: (db) =>
      db.query.brick.findMany({
        where: { wallId: { eq: librarySessionInputs.resources.wall[0].id } },
      }),
  });

  return (
    <ModuleFilmstrip
      breakpoint={breakpoint}
      displayPlaceholders={displayPlaceholders}
      wallBricks={bricksQuery.data}
      renderModuleLink={(brickModule) => (
        <Link
          to="/modules/$moduleId"
          params={{ moduleId: brickModule.id }}
          resetScroll={false}
          data-module-link={brickModule.id}
        >
          {brickModule.label}
        </Link>
      )}
    />
  );
}
