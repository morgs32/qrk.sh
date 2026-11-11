import { createFileRoute } from "@tanstack/react-router";
import Page from "@/app/[username]/site/[siteId]/page/[pageId]/(sidebar)/(bricks)/brick/[brickId]/page";

export const Route = createFileRoute("/$username/site/$siteId/page/$pageId/_sidebar/brick/$brickId")({
  component: Page,
});
