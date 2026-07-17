import { findCollectionBrick } from "@qrk.sh/bricks";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { useGridStore } from "../useGridStore";

export const Route = createFileRoute("/collections/$collectionName/gridBrick/$gridBrickId")({
  component: GridBrickDetail,
});

function GridBrickDetail() {
  const { collectionName, gridBrickId } = Route.useParams();
  const hasHydrated = useGridStore((state) => state.hasHydrated);
  const brickDef = useGridStore((state) => state.gridBricksById[gridBrickId]);
  const brick =
    brickDef?.collectionName === collectionName ? findCollectionBrick(brickDef) : undefined;

  if (!hasHydrated) {
    return <div className="px-6 pt-6 text-sm text-zinc-500">Loading grid brick…</div>;
  }

  if (!brick) {
    return (
      <div className="px-6 pt-6" data-testid="grid-brick-not-found">
        <Link
          to="/collections/$collectionName"
          params={{ collectionName }}
          className="inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft aria-hidden className="size-4" />
          <span>Back to collection</span>
        </Link>
        <h1 className="mb-2 mt-8 text-4xl font-semibold tracking-tight">Grid brick not found</h1>
        <p className="mt-0 text-zinc-600">
          This grid brick ID is not stored for the requested collection.
        </p>
      </div>
    );
  }

  const BrickComponent = brick.component;

  return (
    <section data-testid="brick-detail-pane">
      <div className="px-6 pt-6">
        <Link
          to="/collections/$collectionName"
          params={{ collectionName }}
          className="inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft aria-hidden className="size-4" />
          <span>Back to {brick.def.collectionLabel}</span>
        </Link>
        <p className="mb-0 mt-8 text-sm text-zinc-500">Brick detail</p>
        <h1 className="mb-1 mt-2 text-4xl font-semibold tracking-tight">{brick.def.label}</h1>
        <p className="mt-0 font-mono text-sm text-zinc-500">
          {brick.def.collectionName}/{brick.def.name}
        </p>
      </div>
      <div className="mt-8 overflow-auto">
        <div
          className="qrk-bricks overflow-hidden"
          data-testid="selected-brick-preview"
          style={{
            width: `${(brick.def.w / 8) * 100}%`,
            aspectRatio: `${brick.def.w} / ${brick.def.h}`,
          }}
        >
          <BrickComponent />
        </div>
      </div>
    </section>
  );
}
