import {
  isRouteErrorResponse,
  Link,
  useParams,
  type LoaderFunctionArgs,
  useRouteError} from "react-router";

import { BrickBreakpointProvider } from "../../../components/brick/BrickBreakpointProvider";
import { BrickPreviewFrame } from "../../../components/brick/BrickPreviewFrame";
import { BREAKPOINTS } from "../../../breakpoints";
import { modulesHash } from "../../../modulesHash";

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
  const BrickComponent = brick.component;

  return (
    <main className="min-h-screen p-6">
      <Link to={`/modules/${encodeURIComponent(brick.def.moduleId)}`}>
        Back to {brick.def.moduleLabel}
      </Link>
      <h1 className="mt-6">{brick.def.moduleLabel}</h1>
      <div className="mt-6 flex flex-col gap-8">
        {BREAKPOINTS.map((entry) => (
          <BrickBreakpointProvider key={entry.id}>
            {({ containerRef }) => (
              <section>
                <h2>{entry.id}</h2>
                <div className="overflow-auto">
                  <div ref={containerRef} style={{ width: entry.previewWidth }}>
                    <BrickPreviewFrame w={brick.def[entry.id].w} h={brick.def[entry.id].h}>
                      <div className="size-full overflow-hidden" data-testid="brick-preview">
                        <BrickComponent breakpoint={entry.id} data={brickModule.defaultData} />
                      </div>
                    </BrickPreviewFrame>
                  </div>
                </div>
              </section>
            )}
          </BrickBreakpointProvider>
        ))}
      </div>
    </main>
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
        <Link to="/modules">Return to all modules</Link>
      </div>
    </main>
  );
}
