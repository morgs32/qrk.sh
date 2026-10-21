"use client";

import { useContext, useState } from "react";
import { WallEditorContext } from "./WallEditorContext";
import { useReducedMotion } from "framer-motion";

import { BREAKPOINTS } from "@qrk.sh/library/breakpoints";
import { WallBreakpointPane } from "@qrk.sh/library/WallBreakpointPane";
import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";
import { SiteHeader } from "../../SiteHeader";

export function PagePreview() {
  const { activeBreakpoint } = useWallViewport();
  const editor = useContext(WallEditorContext);
  if (editor === null) throw new Error("PagePreview requires WallEditorContext");
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
    <div className="w-full" data-testid="page-preview">
      <div className="relative w-full" data-testid="page-preview-layout">
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
                className="min-h-0 flex-1 overflow-y-auto bg-white"
                data-site-right-scroll
                role="region"
                aria-label={`${row.id} page preview`}
              >
                {isActive ? (
                  <div className="@container grid min-h-full grid-rows-[auto_1fr]">
                    <SiteHeader />
                    {editor.renderWall(row.id)}
                  </div>
                ) : null}
              </div>
            </WallBreakpointPane>
          );
        })}
      </div>
    </div>
  );
}
