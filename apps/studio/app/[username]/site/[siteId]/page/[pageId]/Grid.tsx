"use client";

import { stageAggregateSessionCommand } from "@zerospin/core/aggregateSession/stageCommand/stageAggregateSessionCommand";

import { useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter, useSelectedLayoutSegments } from "next/navigation";
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
  const drawerOpen = useSelectedLayoutSegments().includes("(drawer)");
  const gridRef = useRef<HTMLDivElement>(null);
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

  useLayoutEffect(() => {
    const scroll = gridRef.current?.querySelector<HTMLDivElement>(
      '[data-wall-active="true"] [data-site-right-scroll]',
    );
    if (scroll == null) return;

    let position = {
      top: scroll.scrollTop,
      max: Math.max(0, scroll.scrollHeight - scroll.clientHeight),
      viewportHeight: scroll.clientHeight,
    };
    function rememberScroll() {
      // A resize may clamp scrollTop before its observer runs. Keep the old anchor.
      if (scroll.clientHeight !== position.viewportHeight) return;
      position.top = scroll.scrollTop;
      position.max = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    }
    const observer = new ResizeObserver(() => {
      const viewportHeight = scroll.clientHeight;
      if (viewportHeight === position.viewportHeight) {
        // Content growth updates the anchor measurement without following it.
        rememberScroll();
        return;
      }
      const max = Math.max(0, scroll.scrollHeight - viewportHeight);
      const atBottom = position.max > 0 && Math.abs(position.max - position.top) <= 1;
      scroll.scrollTop = atBottom ? max : Math.min(Math.max(position.top, 0), max);
      position = { top: scroll.scrollTop, max, viewportHeight };
    });
    scroll.addEventListener("scroll", rememberScroll, { passive: true });
    observer.observe(scroll);
    if (scroll.lastElementChild !== null) observer.observe(scroll.lastElementChild);
    return () => {
      scroll.removeEventListener("scroll", rememberScroll);
      observer.disconnect();
    };
  }, [activeBreakpoint, wallId]);

  if (wallId === undefined || wallId === null) return null;
  return (
    <div
      ref={gridRef}
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
                className="[--wall-chrome-height:7rem]"
                data-site-right-scroll
                data-brick-scroll-root
                role="region"
                aria-label={`${row.id} page preview`}
                tabIndex={0}
              >
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
