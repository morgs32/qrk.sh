import { createFileRoute, Outlet } from "@tanstack/react-router";
import SiteRootLayout from "@/app/[username]/site/[siteId]/layout";

export const Route = createFileRoute("/$username/site/$siteId")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <SiteRootLayout>
      <Outlet />
    </SiteRootLayout>
  );
}
