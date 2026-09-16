import { Outlet, createFileRoute, notFound, useLocation } from "@tanstack/react-router";
import { OrderedBody } from "@qrk.sh/web/library/OrderedBody";
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
  return (
    <div className="flex flex-col gap-8 p-6 lg:flex-row lg:gap-10 lg:p-8">
      <aside className="hidden shrink-0 lg:block">
        <OrderedOutline />
      </aside>
      <div className="min-w-0 flex-1">
        <OrderedBody>
          <li>
            <Outlet key={`${location.pathname}${location.searchStr}`} />
          </li>
        </OrderedBody>
      </div>
    </div>
  );
}
