import { createFileRoute } from "@tanstack/react-router";

import ModulesPage from "../app/modules/page";

export const Route = createFileRoute("/modules")({ component: ModulesPage });
