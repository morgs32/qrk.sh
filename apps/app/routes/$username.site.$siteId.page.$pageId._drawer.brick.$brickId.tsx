import { createFileRoute } from "@tanstack/react-router";
import Page from "@/app/[username]/site/[siteId]/page/[pageId]/(drawer)/(bricks)/brick/[brickId]/page";

export const Route = createFileRoute("/$username/site/$siteId/page/$pageId/_drawer/brick/$brickId")({
  component: Page,
});
