import { collectionsHash } from "@qrk.sh/bricks";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { useGridStore } from "../useGridStore";

export const Route = createFileRoute("/_sandbox/collections/$collectionName/brick/$brickId")({
  component: BrickDetail,
});

function BrickDetail() {
  const { collectionName, brickId } = Route.useParams();
  const hasHydrated = useGridStore((state) => state.hasHydrated);
  const brickDef = useGridStore((state) => state.bricksById[brickId]);
  const collection =
    brickDef?.collectionName === collectionName
      ? collectionsHash[brickDef.collectionName]
      : undefined;
  const variant = collection?.variants[brickDef?.variant ?? ""];
  const brick = variant?.sizes[brickDef?.size ?? ""];

  if (!hasHydrated) {
    return <div className="px-6 pt-6 text-sm text-zinc-500">Loading brick…</div>;
  }

  if (!brick) {
    return (
      <div className="px-6 pt-6" data-testid="brick-not-found">
        <Link
          to="/collections/$collectionName"
          params={{ collectionName }}
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
          {brick.def.collectionName}/{brick.def.variant}/{brick.def.size}
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
          {variant?.defaultData === undefined ? (
            <BrickComponent />
          ) : (
            <BrickComponent data={variant.defaultData} />
          )}
        </div>
      </div>
    </section>
  );
}
