import { Link, createFileRoute, notFound } from "@tanstack/react-router";

import { BrickBreakpointProvider } from "../../../lib/BrickBreakpointProvider";
import { BrickPreview } from "../../../lib/BrickPreview";
import { BREAKPOINTS } from "../../../lib/breakpoints";
import { modulesHash } from "../../../lib/modulesHash";

export const Route = createFileRoute("/bricks/$moduleId")({
  beforeLoad: ({ params }) => {
    if (modulesHash[params.moduleId] === undefined) {
      throw notFound();
    }
  },
  component: BrickPage,
});

function BrickPage() {
  const { moduleId } = Route.useParams();
  const brickModule = modulesHash[moduleId];
  if (brickModule === undefined) {
    throw notFound();
  }
  const brick = brickModule;
  const BrickComponent = brick.component;

  return (
    <main className="min-h-screen p-6">
      <Link to="/modules/$moduleId" params={{ moduleId: brick.def.moduleId }}>
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
                    <BrickPreview w={brick.def[entry.id].w} h={brick.def[entry.id].h}>
                      <div className="size-full overflow-hidden" data-testid="brick-preview">
                        <BrickComponent breakpoint={entry.id} data={brickModule.defaultData} />
                      </div>
                    </BrickPreview>
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
