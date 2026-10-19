import { createFileRoute } from "@tanstack/react-router";

import ModulePage from "../app/modules/[moduleId]/page";
import NotFound from "../app/not-found";

export const Route = createFileRoute("/modules_/$moduleId")({
  component: ModulePage,
  notFoundComponent: NotFound,
});
