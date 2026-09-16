import { createFileRoute, notFound } from "@tanstack/react-router";
import { makeEffectSchema } from "@zerospin/schema";
import { Schema } from "effect";
import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";

import { OrderedSection } from "@qrk.sh/web/library/OrderedDoc";

import { useBrickBreakpoint } from "../../../../lib/BrickBreakpointProvider";
import { BrickPreview } from "../../../../lib/BrickPreview";
import { modulesHash } from "../../../../lib/modulesHash";
import { Button } from "../../../../components/ui/button";
import { Configuration } from "../../../Configuration";
import { resolveBrickBreakpoint } from "../../../../lib/resolveBrickBreakpoint";
import { useBricksStore, useBricksStoreApi } from "../../../../lib/BrickStoreProvider";

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

  if (!hasHydrated) {
    return <li>Loading brick…</li>;
  }

  if (!brick || !brickModule || !brickDef) {
    throw notFound();
  }

  const BrickComponent = brick.component;
  const brickData = brickDef.data;
  const entry = resolveBrickBreakpoint(brickDef, breakpoint);
  const OptionsForm = BrickComponent.options?.form;
  let inheritedBreakpoint = "sm";
  if (breakpoint === "xl" && brickDef.lg) inheritedBreakpoint = "lg";
  else if ((breakpoint === "xl" || breakpoint === "lg") && brickDef.md) inheritedBreakpoint = "md";

  return (
    <>
      <OrderedSection data-testid="brick-detail-pane" headingClassName="shrink-0" label="Preview">
        <div className="mt-5 overflow-auto py-6">
          <BrickPreview
            w={entry.gridItem?.w ?? brick.def[breakpoint].w}
            h={entry.gridItem?.h ?? brick.def[breakpoint].h}
          >
            <div className="size-full qrk-bricks" data-testid="selected-brick-preview">
              <BrickComponent breakpoint={breakpoint} data={brickData} options={entry.options} />
            </div>
          </BrickPreview>
        </div>
      </OrderedSection>
      {brickModule.configuration ? (
        <OrderedSection className="mt-10" headingClassName="shrink-0 py-4" label="Configuration">
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
      <OrderedSection className="mt-10" headingClassName="shrink-0 py-4" label="Options">
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
        {OptionsForm && (
          <OptionsForm
            value={entry.options}
            onChange={(value) => {
              bricksStore.getState().setOptions(brickId, breakpoint, value);
            }}
          />
        )}
      </OrderedSection>
      <OrderedSection className="mt-10" headingClassName="shrink-0 py-4" label="Brick Definition">
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
