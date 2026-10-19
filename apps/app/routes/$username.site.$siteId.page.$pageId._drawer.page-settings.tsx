import { createFileRoute } from "@tanstack/react-router";
import Page from "@/app/[username]/site/[siteId]/page/[pageId]/(drawer)/page-settings/page";

export const Route = createFileRoute("/$username/site/$siteId/page/$pageId/_drawer/page-settings")({
  component: Page,
});
