"use client";

import { useState } from "react";
import { useMatches } from "@tanstack/react-router";
import { useReducedMotion } from "framer-motion";

import { BREAKPOINTS } from "@qrk.sh/library/breakpoints";
import { WallBreakpointPane } from "@qrk.sh/library/WallBreakpointPane";
import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";

export function Grid() {
  const { activeBreakpoint } = useWallViewport();
  const drawerOpen = useMatches({
    select: (matches) =>
      matches.some((match) => match.routeId === "/$username/site/$siteId/page/$pageId/_drawer"),
  });
  const reducedMotion = useReducedMotion() ?? false;
  const [transition, setTransition] = useState<{
    active: (typeof BREAKPOINTS)[number]["id"] | null;
    from: (typeof BREAKPOINTS)[number]["id"] | null;
    direction: 1 | -1 | 0;
    version: number;
  }>({ active: null, from: null, direction: 0, version: 0 });
  if (transition.active !== activeBreakpoint) {
    setTransition({
      active: activeBreakpoint,
      from: transition.active !== null && activeBreakpoint !== null ? transition.active : null,
      direction:
        transition.active !== null && activeBreakpoint !== null
          ? BREAKPOINTS.findIndex((row) => row.id === activeBreakpoint) >
            BREAKPOINTS.findIndex((row) => row.id === transition.active)
            ? 1
            : -1
          : 0,
      version: transition.version + 1,
    });
  }
  const fromBreakpoint = transition.active === activeBreakpoint ? transition.from : null;
  const direction = transition.active === activeBreakpoint ? transition.direction : 0;

  return (
    <div
      className="min-h-full w-full"
      data-editor-drawer-open={drawerOpen}
      data-testid="grid-region"
    >
      <div className="relative min-h-full w-full" data-testid="grid-layout">
        {BREAKPOINTS.map((row) => {
          const isActive = activeBreakpoint === row.id;
          const isOutgoing = fromBreakpoint === row.id && !isActive;
          return (
            <WallBreakpointPane
              key={row.id}
              breakpoint={row.id}
              previewWidth={row.previewWidth}
              isActive={isActive}
              isOutgoing={isOutgoing}
              isOnStage={isActive || isOutgoing}
              isTransitioning={fromBreakpoint !== null}
              direction={direction}
              reducedMotion={reducedMotion}
              onOutgoingComplete={() => {
                setTransition((current) =>
                  current.version === transition.version && current.from === row.id
                    ? { ...current, from: null }
                    : current,
                );
              }}
            >
              <div
                className="bg-white"
                data-site-right-scroll
                role="region"
                aria-label={`${row.id} page preview`}
              />
            </WallBreakpointPane>
          );
        })}
      </div>
    </div>
  );
}
