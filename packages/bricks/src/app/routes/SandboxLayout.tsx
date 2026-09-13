import { Link, Outlet } from "react-router";
import { OrderedTableOfContents } from "../../OrderedTableOfContents";

import { SandboxGrid } from "../SandboxGrid";

export default function SandboxLayout() {
  return (
    <main className="min-h-screen">
      <div className="grid min-h-screen md:grid-cols-2">
        <section className="fixed inset-y-0 left-0 z-60 h-dvh w-full overflow-hidden border-r border-zinc-300 bg-white pb-6 shadow-[6px_0_12px_-4px_rgba(0,0,0,0.3)] has-[[data-full-width-pane]]:md:w-full md:w-1/2 md:pb-0">
          <OrderedTableOfContents.Container>
            <OrderedTableOfContents.Title>
              <Link to="/">Brick collections</Link>
            </OrderedTableOfContents.Title>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <Outlet />
            </div>
          </OrderedTableOfContents.Container>
        </section>
        <div aria-hidden="true" className="hidden md:block" />
        <SandboxGrid />
      </div>
    </main>
  );
}
