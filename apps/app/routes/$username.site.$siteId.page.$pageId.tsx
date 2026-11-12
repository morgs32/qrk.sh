import { createFileRoute, Outlet } from "@tanstack/react-router";
import { makeIdSchema } from "@zerospin/sdk/browser";
import { brickV6 } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV6";
import {
  rowIdSchema,
  stackIdSchema,
} from "@qrk.sh/zerospin/src/aggregates/user/layout/wallLayoutSchema";
import { Schema } from "effect";
import PageLayout from "@/app/[username]/site/[siteId]/page/[pageId]/layout";

const isWallSelectionId = Schema.is(
  Schema.Union([rowIdSchema, stackIdSchema, makeIdSchema(brickV6)]),
);

export const Route = createFileRoute("/$username/site/$siteId/page/$pageId")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { breakpoint?: string; selected?: string } => ({
    breakpoint: typeof search.breakpoint === "string" ? search.breakpoint : undefined,
    selected: isWallSelectionId(search.selected) ? search.selected : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { pageId } = Route.useParams();
  return (
    <PageLayout key={pageId}>
      <Outlet />
    </PageLayout>
  );
}
