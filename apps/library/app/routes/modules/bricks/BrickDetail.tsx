import { makeEffectSchema } from "@zerospin/schema";
import { Schema } from "effect";
import { ArrowLeft } from "lucide-react";
import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";
import { Link, useParams } from "react-router";

import { useBrickBreakpoint } from "../../../../components/brick/BrickBreakpointProvider";
import { BrickPreviewFrame } from "../../../../components/brick/BrickPreviewFrame";
import { modulesHash } from "../../../../modulesHash";
import { Button } from "../../../../components/ui/button";
import { Configuration } from "../../../Configuration";
import { resolveBrickBreakpoint } from "../../../resolveBrickBreakpoint";
import { useGridStore } from "../../../useGridStore";

export default function BrickDetail() {
  const { breakpoint } = useBrickBreakpoint();
  const params = useParams();
  if (!params.moduleId || !params.brickId) throw new Response("Not found", { status: 404 });
  const { moduleId, brickId } = params;
  const hasHydrated = useGridStore((state) => state.hasHydrated);
  const brickDef = useGridStore((state) => state.bricksById[brickId]);
  const brickModule =
    brickDef?.moduleId === moduleId ? modulesHash[brickDef.moduleId] : undefined;
  const brick = brickModule;

  if (!hasHydrated) {
    return <div className="px-6 pt-6">Loading brick…</div>;
  }

  if (!brick || !brickModule || !brickDef) {
    return (
      <div className="px-6 pt-6" data-testid="brick-not-found">
        <Link
          to={`/modules/${encodeURIComponent(moduleId)}`}
          className="inline-flex items-center gap-2"
        >
          <ArrowLeft aria-hidden className="size-4" />
          <span>Back to module</span>
        </Link>
        <h1 className="mb-2 mt-8 text-4xl font-semibold tracking-tight">Brick not found</h1>
        <p className="mt-0">This brick ID is not stored for the requested module.</p>
      </div>
    );
  }

  const BrickComponent = brick.component;
  const brickData = brickDef.data;
  const entry = resolveBrickBreakpoint(brickDef, breakpoint);
  const OptionsForm = BrickComponent.options?.form;
  let inheritedBreakpoint = "sm";
  if (breakpoint === "xl" && brickDef.lg) inheritedBreakpoint = "lg";
  else if ((breakpoint === "xl" || breakpoint === "lg") && brickDef.md) inheritedBreakpoint = "md";

  return (
    <section data-testid="brick-detail-pane">
      <h2 className="m-0 shrink-0 bg-zinc-100 px-4 py-4 font-normal sticky top-0 z-10">
        <Link to={`/modules/${encodeURIComponent(moduleId)}`}>{brickModule.label}</Link>
      </h2>
      <div
        className={`overflow-auto py-6 ${(entry.gridItem?.w ?? brick.def[breakpoint].w) === 8 ? "" : "px-4"}`}
      >
        <BrickPreviewFrame
          w={entry.gridItem?.w ?? brick.def[breakpoint].w}
          h={entry.gridItem?.h ?? brick.def[breakpoint].h}
        >
          <div className="size-full qrk-bricks" data-testid="selected-brick-preview">
            <BrickComponent
              breakpoint={breakpoint}
              data={brickData}
              options={entry.options}
            />
          </div>
        </BrickPreviewFrame>
      </div>
      <div className="pb-6">
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
              onExcessProperty: "preserve"});
            useGridStore.setState((state) => ({
              bricksById: {
                ...state.bricksById,
                [brickId]: { ...state.bricksById[brickId], data: decodedData }}}));
          }}
        />
        <h2 className="m-0 shrink-0 bg-zinc-100 px-4 py-4 font-normal">Options</h2>
        <div className="flex flex-wrap gap-2 px-4 py-4">
          {breakpoint !== "sm" && (
            <Button
              type="button"
              variant="outline"
              disabled={brickDef[breakpoint] === undefined}
              onClick={() => {
                useGridStore.setState((state) => {
                  const currentBrick = state.bricksById[brickId];
                  if (!currentBrick) return state;
                  const inheritedBrick = { ...currentBrick };
                  delete inheritedBrick[breakpoint];
                  return {
                    bricksById: {
                      ...state.bricksById,
                      [brickId]: inheritedBrick}};
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
              useGridStore.getState().setVisible(brickId, breakpoint, entry.gridItem === null)
            }
          >
            {entry.gridItem === null ? "Show brick" : "Hide brick"}
          </Button>
        </div>
        {OptionsForm && (
          <OptionsForm
            value={entry.options}
            onChange={(value) => {
              useGridStore.getState().setOptions(brickId, breakpoint, value);
            }}
          />
        )}
        <h2 className="m-0 shrink-0 bg-zinc-100 px-4 py-4 font-normal">Brick Definition</h2>
        <div className="overflow-auto bg-white px-2 py-4" data-testid="module-data-result">
          <JsonView
            shouldExpandNode={collapseAllNested}
            data={brickDef}
            style={{ ...defaultStyles, container: "bg-white" }}
          />
        </div>
      </div>
    </section>
  );
}
