"use client";

import { useState } from "react";

import { notFound, useParams } from "next/navigation";
import { makeModelIdSchema } from "@zerospin/core/models/make/makeModelIdSchema";
import { isNonEmptySpec } from "@json-render/core";
import { Result, Schema } from "effect";
import { makeEffectSchema } from "@zerospin/shapes";
import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { stageCommand, useLiveQuery } from "@zerospin/react";
import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";

import { OrderedBody } from "@qrk.sh/web/library/OrderedBody";
import { OrderedDoc, OrderedSection } from "@qrk.sh/web/library/OrderedDoc";
import { OrderedOutline } from "@qrk.sh/web/library/OrderedOutline";

import { libraryModule } from "../../../../libraryModule/libraryModule";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { modulesHash } from "../../../../lib/modulesHash";
import type { IModule } from "../../../../lib/types";
import { useWallViewport } from "../../../../lib/WallViewportProvider";
import type { LibraryApi } from "../../../../worker/LibraryApi.public";
import type { IScrapeError } from "../../../../worker/types.public";
import { useLibrarySession } from "../../../../session/createLibraryStandaloneSession";

const specContractByModuleId = {
  "figma-thumbnail": "updateFigmaThumbnailSpecAtBreakpoint",
  "github-activity": "updateGithubActivitySpecAtBreakpoint",
  "github-profile": "updateGithubProfileSpecAtBreakpoint",
  "github-repo": "updateGithubRepoSpecAtBreakpoint",
  image: "updateImageSpecAtBreakpoint",
  instagram: "updateInstagramSpecAtBreakpoint",
  link: "updateLinkSpecAtBreakpoint",
  "map-place": "updateMapPlaceSpecAtBreakpoint",
  "swatch-and-icon": "updateSwatchAndIconSpecAtBreakpoint",
  article: "updateArticleSpecAtBreakpoint",
} as const;

export default function BrickAdmin() {
  const params = useParams();
  const decoded = Schema.decodeUnknownResult(
    Schema.Struct({ brickId: makeModelIdSchema(libraryModule.models.brick) }),
  )(params);
  if (Result.isFailure(decoded)) notFound();
  return <BrickAdminContent key={decoded.success.brickId} brickId={decoded.success.brickId} />;
}

function BrickAdminContent(props: { brickId: `brk_${string}` }) {
  const { brickId } = props;
  const { activeBreakpoint } = useWallViewport();
  const breakpoint = activeBreakpoint ?? "sm";
  const session = useLibrarySession();
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [isGeneratingSpec, setIsGeneratingSpec] = useState(false);
  const [generateError, setGenerateError] = useState<IScrapeError>();
  const [generateRequestError, setGenerateRequestError] = useState<string>();
  const [commandError, setCommandError] = useState<string | null>(null);
  const [stateDraft, setStateDraft] = useState<string | null>(null);
  const [jsonCommandError, setJsonCommandError] = useState<string | null>(null);
  const [acceptedState, setAcceptedState] = useState<{ state: unknown } | null>(null);

  const brickQuery = useLiveQuery({
    session,
    key: brickId,
    query: (db, queriedBrickId) =>
      db.query.brick.findFirst({
        where: { id: { eq: queriedBrickId } },
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
  const placementsQuery = useLiveQuery({
    session,
    key: breakpoint,
    query: (db, queriedBreakpoint) =>
      db.query.placement.findMany({
        where: { breakpoint: { eq: queriedBreakpoint } },
      }),
  });

  const brickRow = brickQuery.data;
  if (
    acceptedState !== null &&
    brickRow !== undefined &&
    JSON.stringify(brickRow.state) === JSON.stringify(acceptedState.state)
  ) {
    setAcceptedState(null);
  }

  if (brickRow === undefined) {
    notFound();
  }

  const placement = placementQuery.data;
  if (placement === undefined) {
    notFound();
  }

  const brickModule: IModule<typeof brickRow.moduleId> = modulesHash[brickRow.moduleId];

  const brickState = brickRow.state;
  const committedState = acceptedState?.state ?? brickState;
  const committedStateJson = JSON.stringify(committedState, null, 2);
  const stateEditorValue = stateDraft ?? committedStateJson;
  const StateSchema = Schema.toType(makeEffectSchema(brickModule.stateShape));
  const stateSchema = brickModule.hasPlaceholder ? Schema.NullOr(StateSchema) : StateSchema;
  let parsedJson: unknown = null;
  let jsonError: string | null = null;
  try {
    parsedJson = Schema.decodeUnknownSync(stateSchema)(JSON.parse(stateEditorValue), {
      onExcessProperty: "ignore",
    });
  } catch (cause) {
    jsonError = cause instanceof Error ? cause.message : "Invalid state JSON";
  }
  const jsonDirty =
    jsonError === null && JSON.stringify(parsedJson) !== JSON.stringify(committedState);
  const Form = brickModule.Form;

  const hasJsonRender = brickModule.registry !== undefined;
  const rawSpec = placement.spec;
  const placementSpec =
    isNonEmptySpec(rawSpec) ||
    (brickState === null &&
      brickModule.placeholder !== undefined &&
      Schema.is(
        Schema.Struct({
          root: Schema.String,
          elements: Schema.Record(Schema.String, Schema.Never),
          state: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
        }),
      )(rawSpec))
      ? rawSpec
      : undefined;
  if (placementSpec === undefined) {
    notFound();
  }
  const savedGridItem = placement.gridItem;

  return (
    <OrderedDoc>
      <div className="flex flex-col gap-8 px-6 lg:flex-row lg:gap-10 lg:px-8">
        <aside className="hidden shrink-0 self-start pt-6 lg:sticky lg:top-0 lg:block lg:pt-8">
          <OrderedOutline />
        </aside>
        <div className="min-w-0 flex-1 py-6 lg:py-8">
          <OrderedBody showAnchors>
            {commandError !== null ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-4" role="alert">
                {commandError}
              </div>
            ) : null}
            {hasJsonRender ? (
              <OrderedSection data-testid="brick-detail-pane" label="Generate spec">
                <form
                  className="flex flex-col items-start gap-2 py-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void (async () => {
                      const targetBrickId = brickRow.id;
                      const targetBreakpoint = breakpoint;
                      const targetModuleId = brickRow.moduleId;
                      setIsGeneratingSpec(true);
                      setGenerateError(undefined);
                      setGenerateRequestError(undefined);
                      setCommandError(null);
                      try {
                        using api = newSyncRpcSession<LibraryApi>("/rpc");
                        const result = await api.generateSpec(
                          brickRow.moduleId,
                          generatePrompt,
                          brickState,
                          placementSpec,
                        );
                        if (result._tag === "Left") {
                          setGenerateError(result.left);
                          return;
                        }
                        const specContractName = specContractByModuleId[targetModuleId];
                        const commandResult = stageCommand({
                          session,
                          contractName: specContractName,
                          payload: {
                            brickId: targetBrickId,
                            breakpoint: targetBreakpoint,
                            spec: result.right,
                          },
                        });
                        if (commandResult._tag === "Failure") {
                          setCommandError(
                            commandResult.failure.message ??
                              commandResult.failure.code ??
                              "Failed to save generated spec",
                          );
                          return;
                        }
                      } catch (cause) {
                        setGenerateRequestError(
                          cause instanceof Error ? cause.message : String(cause),
                        );
                      } finally {
                        setIsGeneratingSpec(false);
                      }
                    })();
                  }}
                >
                  <label className="block font-medium" htmlFor="generate-spec-prompt">
                    Prompt
                  </label>
                  <Input
                    id="generate-spec-prompt"
                    name="prompt"
                    onChange={(event) => {
                      setGeneratePrompt(event.target.value);
                    }}
                    type="text"
                    value={generatePrompt}
                  />
                  <Button disabled={isGeneratingSpec} type="submit">
                    Generate
                  </Button>
                </form>
                {isGeneratingSpec ? <p role="status">Generating spec…</p> : null}
                {generateError !== undefined ? (
                  <div className="rounded-md border border-red-200 bg-red-50 p-4" role="alert">
                    <p className="m-0 font-mono">{generateError.code}</p>
                    <p className="mb-0 mt-2">{generateError.message}</p>
                  </div>
                ) : null}
                {generateRequestError !== undefined ? (
                  <div className="rounded-md border border-red-200 bg-red-50 p-4" role="alert">
                    {generateRequestError}
                  </div>
                ) : null}
              </OrderedSection>
            ) : null}
            <OrderedSection className={hasJsonRender ? "mt-10" : undefined} label="Options">
              <div className="flex flex-wrap gap-2 py-4">
                <Button
                  type="button"
                  aria-pressed={placement.isVisible}
                  onClick={() => {
                    const otherVisibleLayout = (placementsQuery.data ?? []).flatMap(
                      (otherPlacement) => {
                        if (!otherPlacement.isVisible || otherPlacement.brickId === brickRow.id) {
                          return [];
                        }
                        return [otherPlacement.gridItem];
                      },
                    );
                    const result = stageCommand({
                      session,
                      contractName: "setBrickVisibilityAtBreakpoint",
                      payload: {
                        brickId: brickRow.id,
                        breakpoint,
                        isVisible: !placement.isVisible,
                        currentlyVisible: placement.isVisible,
                        savedGridItem,
                        otherVisibleLayout,
                      },
                    });
                    if (result._tag === "Failure") {
                      setCommandError(
                        result.failure.message ??
                          result.failure.code ??
                          "Failed to update visibility",
                      );
                      return;
                    }
                    setCommandError(null);
                  }}
                >
                  {placement.isVisible ? "Hide brick" : "Show brick"}
                </Button>
              </div>
            </OrderedSection>
            <OrderedSection className="mt-10" label="Shared state">
              <form
                className="flex flex-col gap-2 py-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (Form !== undefined && (jsonError !== null || !jsonDirty)) return;
                  let parsed: unknown;
                  if (Form !== undefined) {
                    parsed = parsedJson;
                  } else {
                    try {
                      parsed = JSON.parse(stateEditorValue);
                    } catch (cause) {
                      setCommandError(cause instanceof Error ? cause.message : "Invalid JSON");
                      return;
                    }
                  }
                  const result = stageCommand({
                    session,
                    contractName: "updateBrickState",
                    payload: {
                      brickId: brickRow.id,
                      moduleId: brickRow.moduleId,
                      state: parsed,
                    },
                  });
                  if (result._tag === "Failure") {
                    const message =
                      result.failure.message ?? result.failure.code ?? "Failed to update state";
                    if (Form !== undefined) setJsonCommandError(message);
                    else setCommandError(message);
                    return;
                  }
                  if (Form !== undefined) {
                    setAcceptedState({ state: parsed });
                    setJsonCommandError(null);
                  } else setCommandError(null);
                  setStateDraft(null);
                }}
              >
                <label className="block font-medium" htmlFor="shared-state-editor">
                  State JSON
                </label>
                <textarea
                  id="shared-state-editor"
                  className="min-h-48 w-full rounded border border-border bg-white p-2 font-mono text-sm"
                  value={stateEditorValue}
                  onChange={(event) => {
                    setStateDraft(event.target.value);
                    setJsonCommandError(null);
                  }}
                />
                {Form !== undefined && jsonError !== null ? (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3" role="alert">
                    {jsonError}
                  </div>
                ) : null}
                {Form !== undefined && jsonCommandError !== null ? (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3" role="alert">
                    {jsonCommandError}
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <Button type="submit" disabled={Form !== undefined && !jsonDirty}>
                    Save state
                  </Button>
                  {Form !== undefined ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setStateDraft(null);
                        setJsonCommandError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </form>
            </OrderedSection>
            <OrderedSection className="mt-10" label="Brick Definition">
              <div className="overflow-auto bg-white py-4" data-testid="module-data-result">
                <JsonView
                  shouldExpandNode={collapseAllNested}
                  data={{
                    brick: brickRow,
                    placement,
                    state: brickState,
                  }}
                  style={{ ...defaultStyles, container: "bg-white" }}
                />
              </div>
            </OrderedSection>
          </OrderedBody>
        </div>
      </div>
    </OrderedDoc>
  );
}
