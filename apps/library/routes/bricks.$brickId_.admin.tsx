import { createFileRoute } from "@tanstack/react-router";

import BrickAdmin from "../app/bricks/[brickId]/admin/page";
import NotFound from "../app/not-found";

export const Route = createFileRoute("/bricks/$brickId_/admin")({
  component: BrickAdmin,
  notFoundComponent: NotFound,
});
