import { createFileRoute, Outlet } from "@tanstack/react-router";
import PageLayout from "@/app/[username]/site/[siteId]/page/[pageId]/layout";

export const Route = createFileRoute("/$username/site/$siteId/page/$pageId")({
  validateSearch: (search: Record<string, unknown>): { breakpoint?: string } => ({
    breakpoint: typeof search.breakpoint === "string" ? search.breakpoint : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { pageId } = Route.useParams();
  return (
    <PageLayout key={pageId}>
      <Outlet />
    </PageLayout>
  );
}
