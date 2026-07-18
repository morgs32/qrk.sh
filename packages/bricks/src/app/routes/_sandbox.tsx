import { Outlet, createFileRoute } from "@tanstack/react-router";

import { SandboxGrid } from "../SandboxGrid";

export const Route = createFileRoute("/_sandbox")({ component: SandboxLayout });

function SandboxLayout() {
  return (
    <main className="min-h-screen">
      <div className="grid min-h-screen md:grid-cols-2">
        <section className="border-b border-zinc-300 bg-white pb-6 has-[[data-full-width-pane]]:md:z-20 has-[[data-full-width-pane]]:md:w-[200%] md:relative md:z-10 md:border-b-0 md:pb-0 md:shadow-[6px_0_12px_-4px_rgba(0,0,0,0.3)]">
          <Outlet />
        </section>
        <SandboxGrid />
      </div>
    </main>
  );
}
