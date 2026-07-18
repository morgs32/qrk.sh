import { useState } from "react";
import { collectionsHash } from "@qrk.sh/bricks";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";

export const Route = createFileRoute("/bricks/$collectionName/$variant/$size")({
  loader: ({ params }) => {
    const collection = collectionsHash[params.collectionName];
    const brick = collection?.variants[params.variant]?.sizes[params.size];

    if (!brick) {
      throw notFound();
    }

    return brick.def;
  },
  component: BrickPage,
  notFoundComponent: BrickNotFound,
});

function BrickPage() {
  const brickDef = Route.useLoaderData();
  const variant = collectionsHash[brickDef.collectionName]?.variants[brickDef.variant];
  const brick = variant?.sizes[brickDef.size];

  if (!brick) {
    throw notFound();
  }
  const [gridUnitPx, setGridUnitPx] = useState(80);
  const [isDark, setIsDark] = useState(false);
  const BrickComponent = brick.component;

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-7xl p-6">
        <Link
          to="/collections/$collectionName"
          params={{ collectionName: brick.def.collectionName }}
          className="text-sm"
        >
          Back to {brick.def.collectionLabel}
        </Link>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section
            className={
              isDark
                ? "qrk-bricks dark rounded-xl bg-zinc-950 p-6"
                : "qrk-bricks rounded-xl bg-white p-6"
            }
            data-testid="brick-canvas"
            data-canvas-theme={isDark ? "dark" : "light"}
          >
            <div className="overflow-auto">
              <div
                className="overflow-hidden"
                data-testid="brick-preview"
                style={{
                  width: brick.def.w * gridUnitPx,
                  height: brick.def.h * gridUnitPx,
                }}
              >
                {variant.defaultData === undefined ? (
                  <BrickComponent />
                ) : (
                  <BrickComponent data={variant.defaultData} />
                )}
              </div>
            </div>
          </section>

          <aside className="rounded-xl border border-zinc-300 bg-white p-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
              Brick variant
            </p>
            <h1 className="m-0 text-2xl font-semibold">{brick.def.label}</h1>
            <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-zinc-500">Collection</dt>
              <dd className="m-0 font-mono">{brick.def.collectionName}</dd>
              <dt className="text-zinc-500">Variant</dt>
              <dd className="m-0 font-mono">{brick.def.variant}</dd>
              <dt className="text-zinc-500">Size</dt>
              <dd className="m-0 font-mono">{brick.def.size}</dd>
              <dt className="text-zinc-500">Width</dt>
              <dd className="m-0">{brick.def.w}</dd>
              <dt className="text-zinc-500">Height</dt>
              <dd className="m-0">{brick.def.h}</dd>
            </dl>

            <label className="mt-6 block text-sm font-medium" htmlFor="grid-unit">
              Grid unit: <output>{gridUnitPx}px</output>
            </label>
            <input
              id="grid-unit"
              className="mt-2 w-full"
              type="range"
              min="40"
              max="160"
              value={gridUnitPx}
              onChange={(event) => setGridUnitPx(event.currentTarget.valueAsNumber)}
            />

            <button
              type="button"
              className="mt-5 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium"
              onClick={() => setIsDark((current) => !current)}
            >
              Use {isDark ? "light" : "dark"} canvas
            </button>
          </aside>
        </div>
      </div>
    </main>
  );
}

function BrickNotFound() {
  return (
    <main className="min-h-screen" data-testid="brick-not-found">
      <div className="mx-auto max-w-3xl p-6">
        <h1>Brick not found</h1>
        <p>The requested collection, variant, and size are not registered in the catalog.</p>
        <Link to="/">Return to all collections</Link>
      </div>
    </main>
  );
}
