import { createFileRoute } from "@tanstack/react-router";
import Page from "@/app/[username]/site/[siteId]/page/[pageId]/page";

export const Route = createFileRoute("/$username/site/$siteId/page/$pageId/")({
  component: Page,
});
