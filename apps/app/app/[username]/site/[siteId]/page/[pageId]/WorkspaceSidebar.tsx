import { useLayoutEffect, useRef, type ReactNode } from "react";

export function WorkspaceSidebar(props: { controls: ReactNode; children: ReactNode }) {
  const { controls, children } = props;
  const sidebarRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const sidebar = sidebarRef.current;
    if (sidebar === null) return;
    const opener = document.activeElement;
    return () => {
      if (!sidebar.contains(document.activeElement)) return;
      const wall = sidebar.parentElement?.querySelector<HTMLElement>(".wall-editor");
      queueMicrotask(() => {
        if (sidebar.isConnected || document.activeElement !== document.body) return;
        const target =
          opener instanceof HTMLElement &&
          opener.isConnected &&
          opener !== document.body &&
          !opener.closest("[data-wall-inline-editor]")
            ? opener
            : wall;
        target?.focus({ preventScroll: true });
      });
    };
  }, []);

  return (
    <aside
      ref={sidebarRef}
      aria-label="Workspace sidebar"
      data-workspace-sidebar=""
      className="flex h-full min-h-0 w-[300px] shrink-0 flex-col border-l border-sidebar-border bg-background max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-[79] max-lg:max-w-[75vw] max-lg:shadow-xl"
    >
      <header className="flex shrink-0 items-center gap-1 border-b border-sidebar-border px-3 py-2">
        {controls}
      </header>
      <div className="@container/workspace flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto max-lg:pb-16">
        {children}
      </div>
    </aside>
  );
}
