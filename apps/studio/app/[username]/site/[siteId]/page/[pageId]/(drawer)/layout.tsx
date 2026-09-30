"use client";

import { ViewTransition, type ReactNode } from "react";

export default function DrawerLayout(props: { children: ReactNode }) {
  const { children } = props;
  return (
    <ViewTransition default="none" exit="drawer-bottom-out">
      <div className="flex h-full min-h-0 flex-col bg-background">{children}</div>
    </ViewTransition>
  );
}
