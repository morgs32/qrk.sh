"use client";

import { modulesHash } from "@qrk.sh/library";
import { userSession } from "@/zerospin/userSession";
import { pageV1 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { GridItemPreview } from "@qrk.sh/library/GridItemPreview";
import { libraryModule } from "@qrk.sh/library/libraryModule";
import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";
import { isNonEmptySpec } from "@json-render/core";
import { makeModelIdSchema } from "@zerospin/core/models/make/makeModelIdSchema";
import { useLiveQuery } from "@zerospin/react";
import { Schema } from "effect";

import { useValidatedParams } from "@/hooks/useValidatedParams";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: makeModelIdSchema(Page),
  brickId: Schema.String,
});

function isBrickId(value: string): value is `brk_${string}` {
  return value.startsWith(`${libraryModule.models.brick.abbreviation}_`);
}

export function BrickDetail() {
  const { activeBreakpoint } = useWallViewport();
  const breakpoint = activeBreakpoint ?? "sm";
  const params = useValidatedParams(ParamsSchema);
  const session = userSession;
  const { data: page } = useLiveQuery({
    session,
    key: params.pageId,
    query: (db, pageId) => db.query.page.findFirst({ where: { id: { eq: pageId } } }),
  });
  const brickId = isBrickId(params.brickId) ? params.brickId : null;

  const brickQuery = useLiveQuery({
    session,
    key: { brickId, wallId: page?.wallId },
    query: (db, { brickId: queriedBrickId, wallId }) =>
      db.query.brick.findFirst({
        where: { id: { eq: queriedBrickId ?? "brk_missing" }, wallId: { eq: wallId ?? "wal_missing" } },
      }),
  });
  const placementQuery = useLiveQuery({
    session,
    key: { brickId: brickQuery.data?.id ?? null, breakpoint },
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
  const spec =
    isNonEmptySpec(rawSpec) ||
    (brickRow?.state === null &&
      brick?.placeholder !== undefined &&
      Schema.is(
        Schema.Struct({
          root: Schema.String,
          elements: Schema.Record(Schema.String, Schema.Never),
          state: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
        }),
      )(rawSpec))
      ? rawSpec
      : undefined;
  const gridItem =
    placement === undefined
      ? undefined
      : typeof placement.gridItem === "string"
        ? (JSON.parse(placement.gridItem) as { w: number; h: number })
        : (placement.gridItem as { w: number; h: number });
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {!brick ||
        !BrickComponent ||
        brickRow === undefined ||
        placement === undefined ||
        spec === undefined ? (
          <div className="px-6 pt-6" data-testid="brick-not-found">
            <h1 className="mb-2 mt-8 text-4xl tracking-tight">Brick not found</h1>
            <p className="text-muted-foreground">
              This brick is not available in this page's current session.
            </p>
          </div>
        ) : (
          <section data-testid="brick-detail-pane">
            <div className="px-6 pt-6">
              <p className="mb-0 mt-8 text-sm text-muted-foreground">Brick detail</p>
              <h1 className="mb-1 mt-2 text-4xl tracking-tight" data-testid="brick-detail-title">
                {brick.label}
              </h1>
              <p className="mt-0 font-mono text-sm text-muted-foreground">{brick.def.moduleId}</p>
            </div>
            <div className="mt-8 overflow-auto">
              <GridItemPreview breakpoint={breakpoint} w={gridItem?.w ?? 1} h={gridItem?.h ?? 1}>
                <div
                  className="size-full qrk-bricks overflow-hidden"
                  data-testid="selected-brick-preview"
                >
                  <BrickComponent breakpoint={breakpoint} state={brickRow.state} spec={spec} />
                </div>
              </GridItemPreview>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
