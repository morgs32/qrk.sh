import { createFileRoute, notFound } from "@tanstack/react-router";

export const Route = createFileRoute("/$username/site/$siteId/")({
  beforeLoad: () => {
    throw notFound();
  },
});
