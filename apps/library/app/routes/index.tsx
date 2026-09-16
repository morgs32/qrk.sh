import { createFileRoute } from "@tanstack/react-router";

import { SandboxLayout } from "../SandboxLayout";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return <SandboxLayout>{null}</SandboxLayout>;
}
