import { useRef, useState } from "react";

import { createFileRoute, notFound } from "@tanstack/react-router";
import { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";

import { OrderedSection } from "@qrk.sh/web/library/OrderedDoc";

import { useBrickBreakpoint } from "../../../../lib/BrickBreakpointProvider";
import { BREAKPOINTS } from "../../../../lib/breakpoints";
import { minGridUnits } from "../../../../lib/BrickPreview";
import { modulesHash } from "../../../../lib/modulesHash";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
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
  const hasHydrated = useBricksStore(state => state.hasHydrated);
  const brickDef = useBricksStore(state => state.bricksById[brickId]);
  const brickModule = brickDef?.moduleId === moduleId ? modulesHash[brickDef.moduleId] : undefined;
  const brick = brickModule;
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [isGeneratingSpec, setIsGeneratingSpec] = useState(false);
  const [generateError, setGenerateError] = useState<IScrapeError>();
  const [generateRequestError, setGenerateRequestError] = useState<string>();
  const measureRef = useRef<HTMLDivElement>(null);

  if (!hasHydrated) {
    return <li>Loading brick…</li>;
  }

  if (!brick || !brickModule || !brickDef) {
    throw notFound();
  }

  const brickState = brickDef.state;
  const entry = brickDef[breakpoint];
  const declaredW = brickModule.def[breakpoint].w;
  const declaredH = brickModule.def[breakpoint].h;
  const hasDeclaredSize = declaredW !== undefined && declaredH !== undefined;
  const BrickComponent = brick.component;
  const hasJsonRender = brickModule.catalog !== undefined && brickModule.registry !== undefined;
  return (
    <>
      {!hasDeclaredSize ? (
        <div
          aria-hidden
          className="pointer-events-none absolute overflow-hidden"
          style={{ width: 0, height: 0 }}
        >
          <div
            ref={measureRef}
            className="qrk-bricks"
            style={{ width: "max-content", height: "max-content" }}
          >
            <BrickComponent breakpoint={breakpoint} state={brickState} spec={entry.spec} />
          </div>
        </div>
      ) : null}
      {hasJsonRender ? (
        <OrderedSection data-testid="brick-detail-pane" label="Generate spec">
          <form
            className="flex flex-col items-start gap-2 py-5"
            onSubmit={event => {
              event.preventDefault();
              void (async () => {
                setIsGeneratingSpec(true);
                setGenerateError(undefined);
                setGenerateRequestError(undefined);
                try {
                  using api = newSyncRpcSession<LibraryApi>("/rpc");
                  const result = await api.generateSpec(
                    moduleId,
                    generatePrompt,
                    brickState,
                    entry.spec,
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
              onChange={event => {
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
            aria-pressed={entry.gridItem !== null}
            onClick={() => {
              if (entry.gridItem !== null) {
                bricksStore.getState().setVisible(brickId, breakpoint, false);
                return;
              }
              if (hasDeclaredSize) {
                bricksStore.getState().setVisible(brickId, breakpoint, true);
                return;
              }
              const element = measureRef.current;
              if (!element) return;
              const bounds = element.getBoundingClientRect();
              const widthPx = Math.round(bounds.width);
              const heightPx = Math.round(bounds.height);
              if (widthPx <= 0 || heightPx <= 0) return;
              const breakpointEntry = BREAKPOINTS.find(row => row.id === breakpoint);
              if (!breakpointEntry) return;
              bricksStore.getState().setVisible(brickId, breakpoint, true, {
                w: minGridUnits(breakpointEntry.gridItemWidth, widthPx),
                h: minGridUnits(breakpointEntry.gridItemWidth, heightPx),
              });
            }}
          >
            {entry.gridItem === null ? "Show brick" : "Hide brick"}
          </Button>
        </div>
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
