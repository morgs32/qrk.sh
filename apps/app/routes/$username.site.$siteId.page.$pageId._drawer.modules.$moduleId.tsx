import { createFileRoute } from "@tanstack/react-router";
import ModuleRoute from "@/app/[username]/site/[siteId]/page/[pageId]/(drawer)/(bricks)/modules/[moduleId]/page";

export const Route = createFileRoute("/$username/site/$siteId/page/$pageId/_drawer/modules/$moduleId")({
  component: ModuleRoute,
});
