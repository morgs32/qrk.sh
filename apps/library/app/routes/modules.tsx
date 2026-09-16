import { Outlet, createFileRoute } from "@tanstack/react-router";

import { SandboxLayout } from "../SandboxLayout";

export const Route = createFileRoute("/modules")({
  component: ModulesLayout,
});

function ModulesLayout() {
  return (
    <SandboxLayout>
      <Outlet />
    </SandboxLayout>
  );
}
