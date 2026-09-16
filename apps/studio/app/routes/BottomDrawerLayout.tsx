import { Outlet } from "react-router";
import { Drawer } from "@qrk.sh/web/library/Drawer";

export const handle = { drawer: "bottom" };

export default function BottomDrawerLayout() {
  return (
    <Drawer side="bottom">
      <Outlet />
    </Drawer>
  );
}
