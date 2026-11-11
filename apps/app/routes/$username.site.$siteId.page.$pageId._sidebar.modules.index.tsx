import { createFileRoute } from "@tanstack/react-router";
import Page from "@/app/[username]/site/[siteId]/page/[pageId]/(sidebar)/(bricks)/modules/page";

export const Route = createFileRoute("/$username/site/$siteId/page/$pageId/_sidebar/modules/")({
  component: Page,
});
