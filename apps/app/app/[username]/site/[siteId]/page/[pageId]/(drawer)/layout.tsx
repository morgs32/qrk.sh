"use client";

import type { ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { DrawerHeader } from "./DrawerHeader";

export default function DrawerLayout(props: { children: ReactNode }) {
  const { children } = props;
  const pathname = useLocation({ select: (location) => location.pathname });
  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden bg-background"
      style={{ viewTransitionName: "app-drawer" }}
    >
      <DrawerHeader key={pathname} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  );
}
