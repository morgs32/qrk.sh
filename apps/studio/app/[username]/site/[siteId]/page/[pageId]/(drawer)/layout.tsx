"use client";

import { ViewTransition, type ReactNode } from "react";
import { Drawer } from "@qrk.sh/library/Drawer";

export default function DrawerLayout(props: { children: ReactNode }) {
  const { children } = props;
  return (
    <ViewTransition default="none" enter="drawer-bottom-in" exit="drawer-bottom-out">
      <Drawer side="bottom" layoutMode="flow" animated={false} aria-label="Workspace drawer">
        {children}
      </Drawer>
    </ViewTransition>
  );
}
