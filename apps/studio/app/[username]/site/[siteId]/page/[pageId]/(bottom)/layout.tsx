import { ViewTransition, type ReactNode } from "react";
import { Drawer } from "@qrk.sh/web/library/Drawer";

export default function DrawerLayout(props: { children: ReactNode }) {
  const { children } = props;
  return (
    <ViewTransition default="none" enter="drawer-bottom-in" exit="drawer-bottom-out">
      <Drawer side="bottom" animated={false}>
        {children}
      </Drawer>
    </ViewTransition>
  );
}
