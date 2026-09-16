import { useState } from "react";

import {
  isRouteErrorResponse,
  Link,
  useParams,
  type LoaderFunctionArgs,
  useRouteError} from "react-router";

import { BrickBreakpointProvider } from "../../components/brick/BrickBreakpointProvider";
import { BrickPreviewFrame } from "../../components/brick/BrickPreviewFrame";
import { modulesHash } from "../../modulesHash";

export function loader({ params }: LoaderFunctionArgs) {
  if (!params.moduleId) throw new Response("Not found", { status: 404 });
  if (!modulesHash[params.moduleId]) throw new Response("Not found", { status: 404 });
  return null;
}

export default function BrickPage() {
  const params = useParams();
  if (!params.moduleId) throw new Response("Not found", { status: 404 });
  const brickModule = modulesHash[params.moduleId];
  const brick = brickModule;

  if (!brick) {
    throw new Response("Not found", { status: 404 });
  }
  const [gridUnitPx, setGridUnitPx] = useState(80);
  const gridWidth = gridUnitPx * 8;
  const [isDark, setIsDark] = useState(false);
  const BrickComponent = brick.component;

  return (
    <BrickBreakpointProvider>
      {({ containerRef, breakpoint }) => (
        <main className="min-h-screen">
          <div className="mx-auto max-w-7xl p-6">
            <Link to={`/modules/${encodeURIComponent(brick.def.moduleId)}`}>
              Back to {brick.def.moduleLabel}
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
                  <div ref={containerRef} style={{ width: gridWidth }}>
                    <BrickPreviewFrame
                      w={brick.def[breakpoint].w}
                      h={brick.def[breakpoint].h}
                    >
                      <div className="size-full overflow-hidden" data-testid="brick-preview">
                        <BrickComponent breakpoint={breakpoint} data={brickModule.defaultData} />
                      </div>
                    </BrickPreviewFrame>
                  </div>
                </div>
              </section>

              <aside className="rounded-xl border border-zinc-300 bg-white p-5">
                <p className="mb-2 font-medium uppercase tracking-[0.16em]">
                  Brick module
                </p>
                <h1 className="m-0 text-2xl font-semibold">{brick.def.moduleLabel}</h1>
                <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2">
                  <dt>Module</dt>
                  <dd className="m-0 font-mono">{brick.def.moduleId}</dd>
                  <dt>Width</dt>
                  <dd className="m-0">{brick.def[breakpoint].w}</dd>
                  <dt>Height</dt>
                  <dd className="m-0">{brick.def[breakpoint].h}</dd>
                </dl>

                <label className="mt-6 block font-medium" htmlFor="grid-unit">
                  Grid unit: <output>{gridUnitPx}px</output>
                </label>
                <input
                  id="grid-unit"
                  className="mt-2 w-full"
                  type="range"
                  min="40"
                  max="192"
                  value={gridUnitPx}
                  onChange={(event) => setGridUnitPx(event.currentTarget.valueAsNumber)}
                />

                <button
                  type="button"
                  className="mt-5 w-full rounded-md border border-zinc-300 px-3 py-2 font-medium"
                  onClick={() => setIsDark((current) => !current)}
                >
                  Use {isDark ? "light" : "dark"} canvas
                </button>
              </aside>
            </div>
          </div>
        </main>
      )}
    </BrickBreakpointProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  if (!isRouteErrorResponse(error) || error.status !== 404) throw error;
  return (
    <main className="min-h-screen" data-testid="brick-not-found">
      <div className="mx-auto max-w-3xl p-6">
        <h1>Brick not found</h1>
        <p>The requested module is not registered in the library.</p>
        <Link to="/">Return to all modules</Link>
      </div>
    </main>
  );
}
