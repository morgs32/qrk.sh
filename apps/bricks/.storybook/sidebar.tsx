import type { ComponentProps } from "react";

// The persistent Sidebar and SidebarContent from shadcn/ui's Radix Sidebar.
// https://ui.shadcn.com/docs/components/radix/sidebar
export function Sidebar(props: ComponentProps<"aside"> & { side: "left" | "right" }) {
  const { side, children, ...asideProps } = props;
  return (
    <aside
      data-slot="sidebar"
      data-side={side}
      className="flex h-full w-[min(25rem,50%)] min-w-0 shrink-0 flex-col border-sidebar-border bg-sidebar text-sidebar-foreground data-[side=left]:order-first data-[side=left]:border-r data-[side=right]:order-last data-[side=right]:border-l"
      {...asideProps}
    >
      {children}
    </aside>
  );
}

export function SidebarContent(props: ComponentProps<"div">) {
  const { children, ...contentProps } = props;
  return (
    <div
      data-slot="sidebar-content"
      className="flex min-h-0 flex-1 flex-col overflow-auto"
      {...contentProps}
    >
      {children}
    </div>
  );
}
