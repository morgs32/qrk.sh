import { createFileRoute } from "@tanstack/react-router";
import Page from "@/app/[username]/site/[siteId]/page/[pageId]/(drawer)/(bricks)/modules/page";

export const Route = createFileRoute("/$username/site/$siteId/page/$pageId/_drawer/modules/")({
  component: Page,
});
