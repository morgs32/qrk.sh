import { Outlet, createFileRoute } from "@tanstack/react-router";

import { SandboxGrid } from "../SandboxGrid";

export const Route = createFileRoute("/_sandbox")({ component: SandboxLayout });

function SandboxLayout() {
  return (
    <main className="min-h-screen">
      <div className="grid min-h-screen md:grid-cols-2">
        <section className="border-b border-zinc-300 pb-6 md:border-b-0 md:border-r md:pb-0">
          <Outlet />
        </section>
        <SandboxGrid />
      </div>
    </main>
  );
}
