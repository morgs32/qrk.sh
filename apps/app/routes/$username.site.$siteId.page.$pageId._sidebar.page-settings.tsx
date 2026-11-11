import { createFileRoute } from "@tanstack/react-router";
import Page from "@/app/[username]/site/[siteId]/page/[pageId]/(sidebar)/page-settings/page";

export const Route = createFileRoute("/$username/site/$siteId/page/$pageId/_sidebar/page-settings")({
  component: Page,
});
