import { createFileRoute } from "@tanstack/react-router";
import Page from "@/app/[username]/site/[siteId]/page/[pageId]/(drawer)/site-settings/page";

export const Route = createFileRoute("/$username/site/$siteId/page/$pageId/_drawer/site-settings")({
  component: Page,
});
