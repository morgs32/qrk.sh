import { BrickViewFrame } from "../BrickViewFrame";
import { Switch } from "../../ui/switch";
import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";
import { CollectionOutline } from "../CollectionOutline";
import { Button } from "../../ui/button";
import { resolveBrickBreakpoint } from "../resolveBrickBreakpoint";
import { BrickPreviewFrame } from "../../BrickPreviewFrame";
import { useBrickBreakpoint } from "../../BrickBreakpointProvider";
import { collectionsHash } from "../../collectionsHash";
import { Link, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { makeEffectSchema } from "@zerospin/schema";
import { Schema } from "effect";
import { Configuration } from "../Configuration";

import { Outline } from "../../Outline";

import { useGridStore } from "../useGridStore";

export default function BrickDetail() {
  const { breakpoint } = useBrickBreakpoint();
  const params = useParams();
  if (!params.collectionName || !params.brickId) throw new Response("Not found", { status: 404 });
  const { collectionName, brickId } = params;
  const hasHydrated = useGridStore((state) => state.hasHydrated);
  const brickDef = useGridStore((state) => state.bricksById[brickId]);
  const collection =
    brickDef?.collectionId === collectionName ? collectionsHash[brickDef.collectionId] : undefined;
  const content = collection?.contents[brickDef?.contentId ?? ""];
  const brick = content?.views[brickDef?.viewId ?? ""];

  if (!hasHydrated) {
    return <div className="px-6 pt-6 text-sm text-zinc-500">Loading brick…</div>;
  }

  if (!brick || !collection || !content || !brickDef) {
    return (
      <div className="px-6 pt-6" data-testid="brick-not-found">
        <Link
          to={`/collections/${encodeURIComponent(collectionName)}`}
          className="inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft aria-hidden className="size-4" />
          <span>Back to collection</span>
        </Link>
        <h1 className="mb-2 mt-8 text-4xl font-semibold tracking-tight">Brick not found</h1>
        <p className="mt-0 text-zinc-600">
          This brick ID is not stored for the requested collection.
        </p>
      </div>
    );
  }

  const BrickComponent = brick.component;
  const brickData = brickDef.data;
  const entry = resolveBrickBreakpoint(brickDef, breakpoint);
  const ViewForm = BrickComponent.form?.form;
  let inheritedBreakpoint = "xs";
  if (breakpoint === "xl" && brickDef.lg) inheritedBreakpoint = "lg";
  else if ((breakpoint === "xl" || breakpoint === "lg") && brickDef.sm) inheritedBreakpoint = "sm";

  return (
    <section data-testid="brick-detail-pane">
      <Outline.Title>
        <Link to={`/collections/${encodeURIComponent(collectionName)}`}>
          {collection.collectionLabel}
        </Link>
      </Outline.Title>
      <CollectionOutline
        collection={collection}
        renderContent={(name, label) => (
          <Link
            to={`/collections/${encodeURIComponent(collectionName)}?content=${encodeURIComponent(name)}`}
            aria-current={name === brick.def.content ? "true" : undefined}
            className="underline aria-[current=true]:no-underline"
          >
            {label}
          </Link>
        )}
        renderView={(name, view, label) => (
          <span
            aria-current={
              name === brick.def.content && view === brick.def.view ? "true" : undefined
            }
            aria-disabled={name !== brick.def.content || view !== brick.def.view}
            className="text-zinc-400 aria-[current=true]:font-semibold aria-[current=true]:text-zinc-900"
          >
            {label}
          </span>
        )}
      />
      <div
        className={`overflow-auto bg-white py-6 ${(entry.gridItem?.w ?? brick.def.w) === 8 ? "" : "px-4"}`}
      >
        <BrickPreviewFrame
          w={entry.gridItem?.w ?? brick.def.w}
          h={entry.gridItem?.h ?? brick.def.h}
        >
          <div className="size-full qrk-bricks" data-testid="selected-brick-preview">
            <BrickViewFrame frame={entry.frame}>
              <BrickComponent
                breakpoint={breakpoint}
                data={brickData}
                viewOptions={entry.viewOptions}
              />
            </BrickViewFrame>
          </div>
        </BrickPreviewFrame>
      </div>
      <div className="pb-6">
        <Configuration
          key={brickId}
          showData={false}
          content={content}
          data={brickData}
          setData={(data) => {
            const DataSchema =
              content.dataShape === null
                ? Schema.Null
                : Schema.toType(makeEffectSchema(content.dataShape));
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
        <Outline.Title>View options</Outline.Title>
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
                  return { bricksById: { ...state.bricksById, [brickId]: inheritedBrick } };
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
          <label className="inline-flex cursor-pointer items-center gap-2">
            <Switch
              aria-label="Card frame"
              checked={entry.frame === "card"}
              onCheckedChange={(checked) => {
                useGridStore.getState().setFrame(brickId, breakpoint, checked ? "card" : "default");
              }}
            />
            Card frame
          </label>
        </div>
        {ViewForm && (
          <ViewForm
            value={entry.viewOptions}
            onChange={(value) => {
              useGridStore.getState().setViewOptions(brickId, breakpoint, value);
            }}
          />
        )}
        <Outline.Title>Brick Definition</Outline.Title>
        <div className="overflow-auto bg-white px-2 py-4" data-testid="content-data-result">
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
