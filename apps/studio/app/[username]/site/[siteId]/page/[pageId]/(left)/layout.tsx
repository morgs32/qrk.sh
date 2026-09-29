import { ViewTransition, type ReactNode } from "react";
import { Drawer } from "@qrk.sh/web/library/Drawer";

export default function DrawerLayout(props: { children: ReactNode }) {
  const { children } = props;
  return (
    <ViewTransition default="none" enter="drawer-left-in" exit="drawer-left-out">
      <Drawer side="left" animated={false}>
        {children}
      </Drawer>
    </ViewTransition>
  );
}
