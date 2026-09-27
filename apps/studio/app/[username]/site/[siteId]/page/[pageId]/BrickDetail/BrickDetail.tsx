"use client";

import { modulesHash } from "@qrk.sh/library";
import { useLibrarySession } from "@qrk.sh/library/createLibraryStandaloneSession";
import { GridItemPreview } from "@qrk.sh/library/GridItemPreview";
import { LibraryFrontend } from "@qrk.sh/library/LibraryFrontend";
import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";
import { isNonEmptySpec, type Spec } from "@json-render/core";
import { useLiveQuery } from "@zerospin/react";
import { Schema } from "effect";
import { ArrowLeft, X } from "lucide-react";
import { Link } from "react-router";
import { href } from "react-router";
import { useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import { useValidatedParams } from "@/hooks/useValidatedParams";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: Schema.String,
  brickId: Schema.String,
});

function isBrickId(value: string): value is `brk_${string}` {
  return value.startsWith(`${LibraryFrontend.models.brick.abbreviation}_`);
}

export function BrickDetail() {
  const { activeBreakpoint } = useWallViewport();
  const breakpoint = activeBreakpoint ?? "sm";
  const navigate = useNavigate();
  const params = useValidatedParams(ParamsSchema);
  const session = useLibrarySession();
  const brickId = isBrickId(params.brickId) ? params.brickId : null;

  const brickQuery = useLiveQuery({
    session,
    key: brickId,
    query: (db, queriedBrickId) =>
      db.query.brick.findFirst({
        where: { id: { eq: queriedBrickId ?? "brk_missing" } },
      }),
  });
  const placementQuery = useLiveQuery({
    session,
    key: { brickId, breakpoint },
    query: (db, { brickId: queriedBrickId, breakpoint: queriedBreakpoint }) =>
      db.query.placement.findFirst({
        where: {
          brickId: { eq: queriedBrickId ?? "brk_missing" },
          breakpoint: { eq: queriedBreakpoint },
        },
      }),
  });

  const brickRow = brickQuery.data;
  const placement = placementQuery.data;
  const brick = brickRow !== undefined ? modulesHash[brickRow.moduleId] : undefined;
  const BrickComponent = brick?.component;
  const rawSpec: unknown =
    placement === undefined
      ? undefined
      : typeof placement.spec === "string"
        ? JSON.parse(placement.spec)
        : placement.spec;
  const spec: Spec | undefined =
    rawSpec !== undefined && isNonEmptySpec(rawSpec) ? rawSpec : undefined;
  const gridItem =
    placement === undefined
      ? undefined
      : typeof placement.gridItem === "string"
        ? (JSON.parse(placement.gridItem) as { w: number; h: number })
        : (placement.gridItem as { w: number; h: number });
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col gap-4 border-b border-border/60 bg-background/95 px-6 pb-5 pt-6 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="cursor-pointer"
            aria-label="Close drawer"
            onClick={() => navigate(href("/:username/site/:siteId/page/:pageId", { ...params }))}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {!brick || !BrickComponent || brickRow === undefined || placement === undefined || spec === undefined ? (
          <div className="px-6 pt-6" data-testid="brick-not-found">
            <Link to={href("/:username/site/:siteId/page/:pageId/brick-group", params)}>
              All modules
            </Link>
            <h1 className="mb-2 mt-8 text-4xl tracking-tight">Brick not found</h1>
            <p className="text-muted-foreground">
              This brick is not available in this page's current session.
            </p>
          </div>
        ) : (
          <section data-testid="brick-detail-pane">
            <div className="px-6 pt-6">
              <Link
                to={href("/:username/site/:siteId/page/:pageId/brick-group/:groupName", {
                  ...params,
                  groupName: brick.def.moduleId,
                })}
                className="inline-flex items-center gap-2 text-sm"
              >
                <ArrowLeft aria-hidden className="size-4" />
                <span>Back to {brick.label}</span>
              </Link>
              <p className="mb-0 mt-8 text-sm text-muted-foreground">Brick detail</p>
              <h1 className="mb-1 mt-2 text-4xl tracking-tight" data-testid="brick-detail-title">
                {brick.label}
              </h1>
              <p className="mt-0 font-mono text-sm text-muted-foreground">{brick.def.moduleId}</p>
            </div>
            <div className="mt-8 overflow-auto">
              <GridItemPreview
                breakpoint={breakpoint}
                w={gridItem?.w ?? 1}
                h={gridItem?.h ?? 1}
              >
                <div
                  className="size-full qrk-bricks overflow-hidden"
                  data-testid="selected-brick-preview"
                >
                  <BrickComponent
                    breakpoint={breakpoint}
                    state={brickRow.state}
                    spec={spec}
                  />
                </div>
              </GridItemPreview>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
