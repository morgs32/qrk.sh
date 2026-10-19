import { createFileRoute } from "@tanstack/react-router";
import Page from "@/app/[username]/site/[siteId]/page/[pageId]/breakpoints/page";

export const Route = createFileRoute("/$username/site/$siteId/page/$pageId/breakpoints")({
  component: Page,
});
