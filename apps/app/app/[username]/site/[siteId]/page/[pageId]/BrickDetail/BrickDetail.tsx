"use client";

import { modulesHash } from "../../../../../../../modules/modulesHash";
import { makePlacementId } from "@qrk.sh/zerospin/src/aggregates/user/layout/makePlacementId";
import { brickV2 } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV2";
import { userSessionDefinition } from "@/zerospin/userSessionDefinition";
import { pageV1 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { siteV1 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { BREAKPOINTS } from "../../../../../../../lib/breakpoints";
import { useLocation, useRouter, useSearch } from "@tanstack/react-router";
import { isNonEmptySpec } from "@json-render/core";
import { makeIdSchema, stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import { useLiveQuery, useSession } from "@zerospin/react";
import { Schema } from "effect";
import { useLayoutEffect, useRef, useState } from "react";

import { useValidatedParams } from "@/hooks/useValidatedParams";
import { BrickWrapper } from "@qrk.sh/bricks/react/BrickWrapper";
import { StudioSidebar } from "@qrk.sh/bricks/react/StudioSidebar";
import NotFound from "@/app/not-found";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: makeIdSchema(Site),
  pageId: makeIdSchema(Page),
  brickId: Schema.String,
});

function isBrickId(value: string): value is `brk_${string}` {
  return value.startsWith(`${brickV2.abbreviation}_`);
}

export function BrickDetail() {
  const search = useSearch({ from: "/$username/site/$siteId/page/$pageId" });
  const entry = BREAKPOINTS.find((row) => row.id === search.breakpoint);
  const breakpoint = entry?.id;
  const params = useValidatedParams(ParamsSchema);
  const session = useSession(userSessionDefinition);
  const { data: site } = useLiveQuery({
    session,
    key: params.siteId,
    query: (db, id) => db.query.site.findFirst({ where: { id: { eq: id } } }),
  });
  const router = useRouter();
  const location = useLocation();
  const [editorEpoch, setEditorEpoch] = useState(0);
  const navigationPending = useRef(false);
  const currentPlacementId = useRef<string | null>(null);
  const brickId = isBrickId(params.brickId) ? params.brickId : null;
  const brickQuery = useLiveQuery({
    session,
    key: { brickId, pageId: params.pageId, siteId: params.siteId },
    query: (db, key) =>
      db.query.brick.findFirst({
        where: {
          id: { eq: key.brickId ?? "brk_missing" },
          pageId: { eq: key.pageId },
          page: { siteId: { eq: key.siteId } },
        },
      }),
  });
  const placementQuery = useLiveQuery({
    session,
    key: { brickId: brickQuery.data?.id ?? null, breakpoint },
    query: (db, key) =>
      db.query.placement.findFirst({
        where: {
          id: {
            eq:
              key.brickId === null || key.breakpoint === undefined
                ? "plc_missing"
                : makePlacementId(key.brickId, key.breakpoint),
          },
        },
      }),
  });

  const brickRow = brickQuery.data;
  const placement = placementQuery.data;
  const placementId = placement?.id ?? null;
  useLayoutEffect(() => {
    navigationPending.current = false;
    currentPlacementId.current = placementId;
    const unsubscribe = router.subscribe("onBeforeNavigate", (event) => {
      if (!event.pathChanged && event.fromLocation?.searchStr === event.toLocation.searchStr)
        return;
      navigationPending.current = true;
      setEditorEpoch((epoch) => epoch + 1);
    });
    return () => {
      navigationPending.current = true;
      currentPlacementId.current = null;
      unsubscribe();
    };
  }, [location.href, params.brickId, placementId, router]);
  if (site === undefined) return <NotFound />;
  const brick = brickRow !== undefined ? modulesHash[brickRow.moduleId] : undefined;
  const view = placement === undefined ? undefined : brick?.variants[placement.variantId];
  const Form = brick?.Form;
  const formState = brickRow?.state === undefined ? brick?.defaultState : brickRow.state;
  const rawSpec: unknown =
    placement === undefined
      ? undefined
      : typeof placement.spec === "string"
        ? JSON.parse(placement.spec)
        : placement.spec;
  const spec =
    isNonEmptySpec(rawSpec) ||
    (brickRow?.state === null &&
      view?.placeholder !== undefined &&
      Schema.is(
        Schema.Struct({
          root: Schema.String,
          elements: Schema.Record(Schema.String, Schema.Never),
          state: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
        }),
      )(rawSpec))
      ? rawSpec
      : undefined;
  const unavailable =
    brick === undefined ||
    brickRow === undefined ||
    placement === undefined ||
    entry === undefined ||
    view === undefined ||
    spec === undefined;

  if (unavailable) {
    return (
      <StudioSidebar
        embedded
        label="Edit brick"
        sections={[
          {
            title: "Brick not found",
            content: (
              <p className="text-muted-foreground">
                This brick is not available in this page's current session.
              </p>
            ),
          },
        ]}
      />
    );
  }

  if (brick.InlineEditor !== undefined) return null;

  const content =
    Form !== undefined ? (
      <Form
        key={`${placement.id}:${editorEpoch}`}
        state={formState}
        previewWidth={entry.previewWidth}
        measureFrame={(selector) => {
          const frame = document
            .querySelector(`[data-wall-placement-id="${CSS.escape(placement.id)}"]`)
            ?.querySelector(selector);
          if (frame === undefined || frame === null) return;
          const { width, height } = frame.getBoundingClientRect();
          return width > 0 && height > 0 ? width / height : undefined;
        }}
        onSave={(state) => {
          if (navigationPending.current || currentPlacementId.current !== placement.id) {
            throw new DOMException("Brick editor navigation started", "AbortError");
          }
          return stageAggregateSessionCommand({
            session,
            contractName: "updateBrick",
            payload: {
              brickId: brickRow.id,
              moduleId: brickRow.moduleId,
              state,
            },
          });
        }}
      />
    ) : (
      <div className="min-w-0 overflow-auto">
        <div
          className="relative shrink-0"
          style={{
            width: Math.min(view.defaultWidth, entry.previewWidth),
            minWidth: view.minWidth,
          }}
        >
          <BrickWrapper
            borderWidth={brickRow.borderWidth}
            className={site.cardStyle ? "brick-surface-card" : undefined}
          >
            <brick.Render variantId={placement.variantId} state={brickRow.state} spec={spec} />
          </BrickWrapper>
        </div>
      </div>
    );

  return <StudioSidebar embedded label="Edit brick" sections={[{ title: brick.label, content }]} />;
}
