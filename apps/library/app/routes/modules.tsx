import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/modules")({
  component: ModulesLayout,
});

function ModulesLayout() {
  return <Outlet />;
}
