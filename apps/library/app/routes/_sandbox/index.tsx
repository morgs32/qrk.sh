import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_sandbox/")({
  component: SandboxIndex,
});

function SandboxIndex() {
  return null;
}
