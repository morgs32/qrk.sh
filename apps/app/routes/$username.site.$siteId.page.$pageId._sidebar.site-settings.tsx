import { createFileRoute } from "@tanstack/react-router";
import Page from "@/app/[username]/site/[siteId]/page/[pageId]/(sidebar)/site-settings/page";

export const Route = createFileRoute("/$username/site/$siteId/page/$pageId/_sidebar/site-settings")({
  component: Page,
});
