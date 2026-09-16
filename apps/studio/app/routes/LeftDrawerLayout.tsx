import { Outlet } from "react-router";
import { Drawer } from "@qrk.sh/web/library/Drawer";

export const handle = { drawer: "left" };

export default function LeftDrawerLayout() {
  return (
    <Drawer side="left">
      <Outlet />
    </Drawer>
  );
}
