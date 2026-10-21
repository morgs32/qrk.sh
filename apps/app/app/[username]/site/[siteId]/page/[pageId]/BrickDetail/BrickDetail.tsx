"use client";

import { modulesHash } from "@qrk.sh/library/modulesHash";
import { makePlacementId } from "@qrk.sh/library/makePlacementId";
import { brickV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV1";
import { UserUI } from "@/zerospin/UserUI";
import { pageV3 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV3";
import { BREAKPOINTS } from "@qrk.sh/library/breakpoints";
import { BrickCardStyleContext } from "@qrk.sh/library/BrickCardStyleContext";
import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";
import { isNonEmptySpec } from "@json-render/core";
import { makeIdSchema, stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import { useLiveQuery } from "@zerospin/react";
import { Schema } from "effect";
import { makeEffectSchema } from "@zerospin/shapes";
import { configureInstagram } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/ConfigureInstagramV1";
import { configureGithubActivity } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/ConfigureGithubActivityV1";
import { configureGithubProfile } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/ConfigureGithubProfileV1";
import { configureGithubRepo } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/ConfigureGithubRepoV1";
import { configureFigmaThumbnail } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/ConfigureFigmaThumbnailV1";
import { configureLink } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/ConfigureLinkV1";
import { configureMapPlace } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/ConfigureMapPlaceV1";
import { useContext, useLayoutEffect, useRef, useState } from "react";

import { useValidatedParams } from "@/hooks/useValidatedParams";
import { BrickWrapper } from "../../../../../../../../library/components/brick/BrickWrapper";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: makeIdSchema(Page),
  brickId: Schema.String,
});

function isBrickId(value: string): value is `brk_${string}` {
  return value.startsWith(`${brickV1.abbreviation}_`);
}

export function BrickDetail() {
  const { activeBreakpoint } = useWallViewport();
  const breakpoint = activeBreakpoint ?? "sm";
  const cardStyle = useContext(BrickCardStyleContext);
  const entry = BREAKPOINTS.find((row) => row.id === breakpoint);
  if (entry === undefined) throw new Error(`Unknown breakpoint: ${breakpoint}`);
  const params = useValidatedParams(ParamsSchema);
  const session = UserUI.useSession();
  const [editorEpoch, setEditorEpoch] = useState(0);
  const navigationPending = useRef(false);
  useLayoutEffect(() => {
    navigationPending.current = false;
    function invalidateEditor() {
      navigationPending.current = true;
      setEditorEpoch((epoch) => epoch + 1);
    }
    function navigate(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank") return;
      const destination = new URL(anchor.href);
      if (
        destination.origin === window.location.origin &&
        (destination.pathname !== window.location.pathname ||
          destination.search !== window.location.search)
      ) {
        invalidateEditor();
      }
    }
    document.addEventListener("click", navigate, true);
    window.addEventListener("popstate", invalidateEditor);
    return () => {
      navigationPending.current = true;
      document.removeEventListener("click", navigate, true);
      window.removeEventListener("popstate", invalidateEditor);
    };
  }, [params.brickId]);
  const brickId = isBrickId(params.brickId) ? params.brickId : null;
  const brickQuery = useLiveQuery({
    session,
    key: { brickId, pageId: params.pageId },
    query: (db, key) =>
      db.query.brick.findFirst({
        where: { id: { eq: key.brickId ?? "brk_missing" }, pageId: { eq: key.pageId } },
      }),
  });
  const placementQuery = useLiveQuery({
    session,
    key: { brickId: brickQuery.data?.id ?? null, breakpoint },
    query: (db, key) =>
      db.query.placement.findFirst({
        where: {
          id: {
            eq: key.brickId === null ? "plc_missing" : makePlacementId(key.brickId, key.breakpoint),
          },
        },
      }),
  });

  const brickRow = brickQuery.data;
  const placement = placementQuery.data;
  const brick = brickRow !== undefined ? modulesHash[brickRow.moduleId] : undefined;
  const BrickComponent = brick?.component;
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
              <div className="mx-auto mt-8 w-full max-w-3xl px-6">
                <Form
                  key={`${brickRow.id}:${editorEpoch}`}
                  state={formState}
                  onSave={(state) => {
                    if (navigationPending.current) {
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
                  onConfigure={(input) => {
                    if (navigationPending.current)
                      throw new DOMException("Brick editor navigation started", "AbortError");
                    const commands = {
                      configureInstagram,
                      configureGithubActivity,
                      configureGithubProfile,
                      configureGithubRepo,
                      configureFigmaThumbnail,
                      configureLink,
                      configureMapPlace,
                    };
                    const commandName = brick.configureCommand;
                    if (
                      commandName === undefined ||
                      input === null ||
                      typeof input !== "object" ||
                      Array.isArray(input)
                    ) {
                      return {
                        _tag: "Failure",
                        failure: { message: "Invalid module configuration" },
                      };
                    }
                    const decoded = Schema.decodeUnknownResult(
                      makeEffectSchema(commands[commandName].payload),
                    )({
                      ...input,
                      brickId: brickRow.id,
                      requestId: crypto.randomUUID(),
                    });
                    if (decoded._tag === "Failure")
                      return {
                        _tag: "Failure",
                        failure: { message: "Invalid module configuration" },
                      };
                    return stageAggregateSessionCommand({
                      session,
                      contractName: commandName,
                      payload: decoded.success,
                    });
                  }}
                  onCancel={() => {
                    navigationPending.current = false;
                    setEditorEpoch((epoch) => epoch + 1);
                  }}
                />
              </div>
            ) : (
              <div className="mt-8 overflow-auto">
                <div
                  data-brick-surface=""
                  data-card-style={cardStyle}
                  className="brick-hover-target relative shrink-0"
                  style={{
                    width: Math.min(brick.viewFor(breakpoint).defaultWidth, entry.previewWidth),
                    minWidth: brick.viewFor(breakpoint).minWidth,
                  }}
                >
                  <BrickWrapper
                    className="brick-hover-surface"
                    data-testid="selected-brick-preview"
                  >
                    <BrickComponent breakpoint={breakpoint} state={brickRow.state} spec={spec} />
                  </BrickWrapper>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
