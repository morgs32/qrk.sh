"use client";

import { modulesHash } from "@qrk.sh/library";
import { UserApp } from "@/zerospin/userSession";
import { pageV1 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { GridItemPreview } from "@qrk.sh/library/GridItemPreview";
import { libraryModule } from "@qrk.sh/library/libraryModule";
import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";
import { isNonEmptySpec } from "@json-render/core";
import { makeModelIdSchema } from "@zerospin/core/models/make/makeModelIdSchema";
import { stageAggregateSessionCommand } from "@zerospin/core/aggregateSession/stageCommand/stageAggregateSessionCommand";
import { useLiveQuery } from "@zerospin/react";
import { Schema } from "effect";
import { useState } from "react";

import { Button } from "@/components/ui/button";
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
  const session = UserApp.useInitializedSession();
  const [formDraft, setFormDraft] = useState<{ brickId: string; state: unknown } | null>(null);
  const [acceptedState, setAcceptedState] = useState<{ brickId: string; state: unknown } | null>(
    null,
  );
  const [formError, setFormError] = useState<{ brickId: string; message: string } | null>(null);
  const [editorEpoch, setEditorEpoch] = useState(0);
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
        where: {
          id: { eq: queriedBrickId ?? "brk_missing" },
          wallId: { eq: wallId ?? "wal_missing" },
        },
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
  const Form = brick?.Form;
  if (
    acceptedState !== null &&
    brickRow !== undefined &&
    acceptedState.brickId === brickRow.id &&
    JSON.stringify(brickRow.state) === JSON.stringify(acceptedState.state)
  ) {
    setAcceptedState(null);
  }
  const committedState =
    acceptedState !== null && acceptedState.brickId === brickRow?.id
      ? acceptedState.state
      : brickRow?.state;
  const formState =
    formDraft !== null && formDraft.brickId === brickRow?.id
      ? formDraft.state
      : (committedState ?? brick?.defaultState);
  const formDirty = JSON.stringify(formState) !== JSON.stringify(committedState);
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
            {Form !== undefined ? (
              <form
                className="mx-auto mt-8 w-full max-w-3xl px-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!formDirty) return;
                  const result = stageAggregateSessionCommand({
                    session,
                    contractName: "updateBrick",
                    payload: {
                      brickId: brickRow.id,
                      moduleId: brickRow.moduleId,
                      state: formState,
                      measurements: null,
                    },
                  });
                  if (result._tag === "Failure") {
                    setFormError({
                      brickId: brickRow.id,
                      message:
                        result.failure.message ?? result.failure.code ?? "Failed to save brick",
                    });
                    return;
                  }
                  setAcceptedState({ brickId: brickRow.id, state: formState });
                  setFormDraft(null);
                  setFormError(null);
                }}
              >
                <div className="flex flex-col gap-6">
                  <Form
                    key={`${brickRow.id}:${editorEpoch}`}
                    state={formState}
                    onChange={(state) => {
                      setFormDraft({ brickId: brickRow.id, state });
                      setFormError(null);
                    }}
                  />
                  {formError !== null && formError.brickId === brickRow.id ? (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3" role="alert">
                      {formError.message}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={!formDirty}>
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setFormDraft(null);
                        setFormError(null);
                        setEditorEpoch((epoch) => epoch + 1);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </form>
            ) : (
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
            )}
          </section>
        )}
      </div>
    </div>
  );
}
