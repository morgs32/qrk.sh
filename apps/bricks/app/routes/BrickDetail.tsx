import { makeEffectSchema } from "@zerospin/schema";
import { Schema } from "effect";
import { ArrowLeft } from "lucide-react";
import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";
import { Link, useParams } from "react-router";

import { useBrickBreakpoint } from "../../BrickBreakpointProvider";
import { BrickPreviewFrame } from "../../BrickPreviewFrame";
import { groupsHash } from "../../groupsHash";
import { Outline } from "../../components/outline/Outline";
import { Button } from "../../components/ui/button";
import { GroupOutline } from "../../components/outline/GroupOutline";
import { Configuration } from "../Configuration";
import { resolveBrickBreakpoint } from "../resolveBrickBreakpoint";
import { useGridStore } from "../useGridStore";

export default function BrickDetail() {
  const { breakpoint } = useBrickBreakpoint();
  const params = useParams();
  if (!params.groupName || !params.brickId) throw new Response("Not found", { status: 404 });
  const { groupName, brickId } = params;
  const hasHydrated = useGridStore((state) => state.hasHydrated);
  const brickDef = useGridStore((state) => state.bricksById[brickId]);
  const group = brickDef?.groupId === groupName ? groupsHash[brickDef.groupId] : undefined;
  const catalog = group?.catalogs[brickDef?.catalogId ?? ""];
  const brick = catalog;

  if (!hasHydrated) {
    return <div className="px-6 pt-6 text-sm text-zinc-500">Loading brick…</div>;
  }

  if (!brick || !group || !catalog || !brickDef) {
    return (
      <div className="px-6 pt-6" data-testid="brick-not-found">
        <Link
          to={`/groups/${encodeURIComponent(groupName)}`}
          className="inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft aria-hidden className="size-4" />
          <span>Back to group</span>
        </Link>
        <h1 className="mb-2 mt-8 text-4xl font-semibold tracking-tight">Brick not found</h1>
        <p className="mt-0 text-zinc-600">This brick ID is not stored for the requested group.</p>
      </div>
    );
  }

  const BrickComponent = brick.component;
  const brickData = brickDef.data;
  const entry = resolveBrickBreakpoint(brickDef, breakpoint);
  const AppearanceForm = BrickComponent.form?.form;
  let inheritedBreakpoint = "xs";
  if (breakpoint === "xl" && brickDef.lg) inheritedBreakpoint = "lg";
  else if ((breakpoint === "xl" || breakpoint === "lg") && brickDef.sm) inheritedBreakpoint = "sm";

  return (
    <section data-testid="brick-detail-pane">
      <Outline.Title>
        <Link to={`/groups/${encodeURIComponent(groupName)}`}>{group.label}</Link>
      </Outline.Title>
      <GroupOutline
        group={group}
        renderCatalog={(name, label) => (
          <Link
            to={`/groups/${encodeURIComponent(groupName)}?catalog=${encodeURIComponent(name)}`}
            aria-current={name === brick.def.catalogId ? "true" : undefined}
            className="underline aria-[current=true]:no-underline"
          >
            {label}
          </Link>
        )}
      />
      <div
        className={`overflow-auto bg-white py-6 ${(entry.gridItem?.w ?? brick.def[breakpoint].w) === 8 ? "" : "px-4"}`}
      >
        <BrickPreviewFrame
          w={entry.gridItem?.w ?? brick.def[breakpoint].w}
          h={entry.gridItem?.h ?? brick.def[breakpoint].h}
        >
          <div className="size-full qrk-bricks" data-testid="selected-brick-preview">
            <BrickComponent
              breakpoint={breakpoint}
              data={brickData}
              appearanceOptions={entry.appearanceOptions}
            />
          </div>
        </BrickPreviewFrame>
      </div>
      <div className="pb-6">
        <Configuration
          key={brickId}
          showData={false}
          catalog={catalog}
          data={brickData}
          setData={(data) => {
            const DataSchema =
              catalog.dataShape === null
                ? Schema.Null
                : Schema.toType(makeEffectSchema(catalog.dataShape));
            const decodedData = Schema.decodeUnknownSync(DataSchema)(data, {
              onExcessProperty: "preserve",
            });
            useGridStore.setState((state) => ({
              bricksById: {
                ...state.bricksById,
                [brickId]: { ...state.bricksById[brickId], data: decodedData },
              },
            }));
          }}
        />
        <Outline.Title>Appearance options</Outline.Title>
        <div className="flex flex-wrap gap-2 px-4 py-4">
          {breakpoint !== "xs" && (
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
              useGridStore.getState().setVisible(brickId, breakpoint, entry.gridItem === null)
            }
          >
            {entry.gridItem === null ? "Show brick" : "Hide brick"}
          </Button>
        </div>
        {AppearanceForm && (
          <AppearanceForm
            value={entry.appearanceOptions}
            onChange={(value) => {
              useGridStore.getState().setAppearanceOptions(brickId, breakpoint, value);
            }}
          />
        )}
        <Outline.Title>Brick Definition</Outline.Title>
        <div className="overflow-auto bg-white px-2 py-4" data-testid="catalog-data-result">
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
