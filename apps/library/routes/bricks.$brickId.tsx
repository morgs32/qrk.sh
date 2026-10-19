import { createFileRoute } from "@tanstack/react-router";

import BrickDetail from "../app/bricks/[brickId]/page";
import NotFound from "../app/not-found";

export const Route = createFileRoute("/bricks/$brickId")({
  component: BrickDetail,
  notFoundComponent: NotFound,
});
