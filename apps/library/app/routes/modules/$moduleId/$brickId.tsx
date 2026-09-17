import { useState } from "react";

import { createFileRoute, notFound } from "@tanstack/react-router";
import { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import { makeEffectSchema } from "@zerospin/schema";
import { Schema } from "effect";
import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";

import { OrderedSection } from "@qrk.sh/web/library/OrderedDoc";

import { useBrickBreakpoint } from "../../../../lib/BrickBreakpointProvider";
import { modulesHash } from "../../../../lib/modulesHash";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Configuration } from "../../../Configuration";
import { resolveBrickBreakpoint } from "../../../../lib/resolveBrickBreakpoint";
import { useBricksStore, useBricksStoreApi } from "../../../../lib/BrickStoreProvider";
import type { LibraryApi } from "../../../../worker/LibraryApi.public";
import type { IScrapeError } from "../../../../worker/types.public";

export const Route = createFileRoute("/modules/$moduleId/$brickId")({
  component: BrickDetail,
});

function BrickDetail() {
  const { breakpoint } = useBrickBreakpoint();
  const { moduleId, brickId } = Route.useParams();
  const bricksStore = useBricksStoreApi();
  const hasHydrated = useBricksStore((state) => state.hasHydrated);
  const brickDef = useBricksStore((state) => state.bricksById[brickId]);
  const brickModule = brickDef?.moduleId === moduleId ? modulesHash[brickDef.moduleId] : undefined;
  const brick = brickModule;
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [isGeneratingSpec, setIsGeneratingSpec] = useState(false);
  const [generateError, setGenerateError] = useState<IScrapeError>();
  const [generateRequestError, setGenerateRequestError] = useState<string>();

  if (!hasHydrated) {
    return <li>Loading brick…</li>;
  }

  if (!brick || !brickModule || !brickDef) {
    throw notFound();
  }

  const brickData = brickDef.data;
  const entry = resolveBrickBreakpoint(brickDef, breakpoint);
  const hasJsonRender = brickModule.catalog !== undefined && brickModule.registry !== undefined;
  const hasConfig =
    brickModule.data !== null && brickModule.data.dataType !== "static";
  const BreakpointOptionsForm = brickModule.breakpoints[breakpoint].options?.form;
  let inheritedBreakpoint = "sm";
  if (breakpoint === "xl" && brickDef.lg) inheritedBreakpoint = "lg";
  else if ((breakpoint === "xl" || breakpoint === "lg") && brickDef.md) inheritedBreakpoint = "md";
  return (
    <>
      {hasJsonRender ? (
        <OrderedSection data-testid="brick-detail-pane" label="Generate spec">
          <form
            className="flex flex-col items-start gap-2 py-5"
            onSubmit={(event) => {
              event.preventDefault();
              void (async () => {
                setIsGeneratingSpec(true);
                setGenerateError(undefined);
                setGenerateRequestError(undefined);
                try {
                  using api = newSyncRpcSession<LibraryApi>("/rpc");
                  const currentSpec =
                    entry.spec ?? brickModule.breakpoints[breakpoint].defaultSpec ?? null;
                  const result = await api.generateSpec(
                    moduleId,
                    generatePrompt,
                    brickData,
                    currentSpec,
                  );
                  if (result._tag === "Left") {
                    setGenerateError(result.left);
                    return;
                  }
                  bricksStore.getState().setSpec(brickId, breakpoint, result.right);
                } catch (cause) {
                  setGenerateRequestError(cause instanceof Error ? cause.message : String(cause));
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
      {hasConfig ? (
        <OrderedSection className={hasJsonRender ? "mt-10" : undefined} label="Configuration">
          <Configuration
            key={brickId}
            showData={false}
            brickModule={brickModule}
            data={brickData}
            setData={(data) => {
              const DataSchema =
                brickModule.dataShape === null
                  ? Schema.Null
                  : Schema.toType(makeEffectSchema(brickModule.dataShape));
              const decodedData = Schema.decodeUnknownSync(DataSchema)(data, {
                onExcessProperty: "preserve",
              });
              bricksStore.setState((state) => ({
                bricksById: {
                  ...state.bricksById,
                  [brickId]: { ...state.bricksById[brickId], data: decodedData },
                },
              }));
            }}
          />
        </OrderedSection>
      ) : null}
      <OrderedSection
        className={hasJsonRender || hasConfig ? "mt-10" : undefined}
        label="Options"
      >
        <div className="flex flex-wrap gap-2 py-4">
          {breakpoint !== "sm" && (
            <Button
              type="button"
              variant="outline"
              disabled={brickDef[breakpoint] === undefined}
              onClick={() => {
                bricksStore.setState((state) => {
                  const currentBrick = state.bricksById[brickId];
                  if (!currentBrick) return state;
                  const inheritedBrick = { ...currentBrick };
                  delete inheritedBrick[breakpoint];
                  return {
                    bricksById: {
                      ...state.bricksById,
                      [brickId]: inheritedBrick,
                    },
                  };
                });
              }}
            >
              Inherit from {inheritedBreakpoint}
            </Button>
          )}
          <Button
            type="button"
            aria-pressed={entry.gridItem !== null}
            onClick={() =>
              bricksStore.getState().setVisible(brickId, breakpoint, entry.gridItem === null)
            }
          >
            {entry.gridItem === null ? "Show brick" : "Hide brick"}
          </Button>
        </div>
        {BreakpointOptionsForm && (
          <BreakpointOptionsForm
            value={entry.breakpointOptions}
            onChange={(value) => {
              bricksStore.getState().setBreakpointOptions(brickId, breakpoint, value);
            }}
          />
        )}
      </OrderedSection>
      <OrderedSection className="mt-10" label="Brick Definition">
        <div className="overflow-auto bg-white py-4" data-testid="module-data-result">
          <JsonView
            shouldExpandNode={collapseAllNested}
            data={brickDef}
            style={{ ...defaultStyles, container: "bg-white" }}
          />
        </div>
      </OrderedSection>
    </>
  );
}
