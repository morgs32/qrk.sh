import type { ReactNode, RefCallback } from "react";

export function WorkspaceSidebar(props: {
  controls: ReactNode;
  bodyRef: RefCallback<HTMLDivElement>;
}) {
  const { controls, bodyRef } = props;
  return (
    <aside
      aria-label="Workspace sidebar"
      data-workspace-sidebar=""
      className="flex h-full min-h-0 w-64 shrink-0 flex-col border-l border-sidebar-border bg-background"
    >
      <header className="flex shrink-0 items-center gap-1 border-b border-sidebar-border px-3 py-2">
        {controls}
      </header>
      <div ref={bodyRef} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto" />
    </aside>
  );
}
