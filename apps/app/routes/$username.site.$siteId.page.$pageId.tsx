import { createFileRoute, Outlet } from "@tanstack/react-router";
import PageLayout from "@/app/[username]/site/[siteId]/page/[pageId]/layout";

export const Route = createFileRoute("/$username/site/$siteId/page/$pageId")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PageLayout>
      <Outlet />
    </PageLayout>
  );
}
