import { createFileRoute } from "@tanstack/react-router";
import { StackDetails } from "@/app/[username]/site/[siteId]/page/[pageId]/StackDetails/StackDetails";

export const Route = createFileRoute("/$username/site/$siteId/page/$pageId/_drawer/stack/$stackId")(
  {
    component: StackDetails,
  },
);
