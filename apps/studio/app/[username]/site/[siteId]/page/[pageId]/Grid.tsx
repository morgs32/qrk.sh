"use client";

import { stageAggregateSessionCommand } from "@zerospin/core/aggregateSession/stageCommand/stageAggregateSessionCommand";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";

import { BrickWall } from "@qrk.sh/library/BrickWall";
import { BREAKPOINTS } from "@qrk.sh/library/breakpoints";
import { WallBreakpointPane } from "@qrk.sh/library/WallBreakpointPane";
import { UserApp } from "@/zerospin/userSession";
import { pageV2 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV2";
import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";
import { makeModelIdSchema } from "@zerospin/core/models/make/makeModelIdSchema";
import { useLiveQuery } from "@zerospin/react";
import { Schema } from "effect";

import { useValidatedParams } from "@/hooks/useValidatedParams";
import { SiteHeader } from "../../SiteHeader";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: makeModelIdSchema(Page),
  brickId: Schema.optional(Schema.String),
});

export function Grid() {
  const { activeBreakpoint, gridGesture, setGridGesture } = useWallViewport();
  const session = UserApp.useInitializedSession();
  const params = useValidatedParams(ParamsSchema);
  const { data: page } = useLiveQuery({
    session,
    key: params.pageId,
    query: (db, pageId) => db.query.page.findFirst({ where: { id: { eq: pageId } } }),
  });
  const router = useRouter();
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
  const wallId = page?.wallId;
  if (wallId === undefined || wallId === null) return null;
  return (
    <div className="min-h-full w-full" data-testid="grid-region">
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
              <div className="[--wall-chrome-height:7rem]">
                <div className="@container translate-y-[var(--wall-drag-scroll-offset,0px)]">
                  <SiteHeader />
                </div>
                <BrickWall
                  session={session}
                  executeCommand={stageAggregateSessionCommand}
                  wallId={wallId}
                  breakpoint={row.id}
                  gridWidth={row.previewWidth}
                  isActive={isActive}
                  selectedBrickId={params.brickId}
                  gridGestureActive={gridGesture}
                  showArticleEditAction={false}
                  onGestureChange={setGridGesture}
                  onCommandError={(message) => toast.error(message)}
                  onBrickActivate={({ brickId }) => {
                    void router.push(
                      `/${encodeURIComponent(params.username)}/site/${encodeURIComponent(params.siteId)}/page/${encodeURIComponent(params.pageId)}/brick/${encodeURIComponent(brickId)}`,
                      { scroll: false },
                    );
                  }}
                />
              </div>
            </WallBreakpointPane>
          );
        })}
      </div>
    </div>
  );
}
