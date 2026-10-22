import { createFileRoute, Outlet } from "@tanstack/react-router";
import SiteLayout from "@/app/[username]/site/[siteId]/layout";

export const Route = createFileRoute("/$username/site/$siteId")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <SiteLayout>
      <Outlet />
    </SiteLayout>
  );
}
