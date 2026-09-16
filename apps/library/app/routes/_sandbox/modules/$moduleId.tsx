import { Outlet, createFileRoute, notFound, useLocation } from "@tanstack/react-router";

import { modulesHash } from "../../../../modulesHash";

export const Route = createFileRoute("/_sandbox/modules/$moduleId")({
  beforeLoad: ({ params }) => {
    if (modulesHash[params.moduleId] === undefined) {
      throw notFound();
    }
  },
  component: ModulePage,
});

function ModulePage() {
  const location = useLocation();
  return <Outlet key={location.pathname + location.search} />;
}
