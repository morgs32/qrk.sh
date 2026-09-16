import { Outlet, createFileRoute, notFound, useLocation } from "@tanstack/react-router";
import { OrderedBody } from "@qrk.sh/web/library/OrderedBody";
import { OrderedDoc } from "@qrk.sh/web/library/OrderedDoc";
import { OrderedOutline } from "@qrk.sh/web/library/OrderedOutline";

import { modulesHash } from "../../../lib/modulesHash";

export const Route = createFileRoute("/modules/$moduleId")({
  beforeLoad: ({ params }) => {
    if (modulesHash[params.moduleId] === undefined) {
      throw notFound();
    }
  },
  component: ModulePage,
});

function ModulePage() {
  const location = useLocation();
  const { moduleId } = Route.useParams();
  const brickModule = modulesHash[moduleId];

  if (!brickModule) {
    throw notFound();
  }

  return (
    <OrderedDoc>
      <div className="flex flex-col gap-8 px-6 lg:flex-row lg:gap-10 lg:px-8">
        <aside className="hidden shrink-0 self-start pt-6 lg:sticky lg:top-0 lg:block lg:pt-8">
          <OrderedOutline />
        </aside>
        <div className="min-w-0 flex-1 py-6 lg:py-8">
          <OrderedBody showAnchors>
            <Outlet key={`${location.pathname}${location.searchStr}`} />
          </OrderedBody>
        </div>
      </div>
    </OrderedDoc>
  );
}
