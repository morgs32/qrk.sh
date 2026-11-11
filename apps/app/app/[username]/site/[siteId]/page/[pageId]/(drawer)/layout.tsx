"use client";

import type { ReactNode } from "react";
import { useParams } from "@tanstack/react-router";
import { DrawerHeader } from "./DrawerHeader";

export default function DrawerLayout(props: { children: ReactNode }) {
  const { children } = props;
  const { brickId } = useParams({ strict: false });
  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden bg-background"
      style={{ viewTransitionName: "app-drawer" }}
    >
      <div className="h-12 shrink-0">
        <DrawerHeader />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
        {brickId === undefined ? null : <div id={`brick-editor-drawer-${brickId}`} />}
      </div>
    </div>
  );
}
