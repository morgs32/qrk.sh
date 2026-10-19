import { createFileRoute, Outlet } from "@tanstack/react-router";
import DrawerLayout from "@/app/[username]/site/[siteId]/page/[pageId]/(drawer)/layout";

export const Route = createFileRoute("/$username/site/$siteId/page/$pageId/_drawer")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <DrawerLayout>
      <Outlet />
    </DrawerLayout>
  );
}
