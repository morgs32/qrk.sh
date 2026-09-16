import { Outlet } from "react-router";
import { Drawer } from "@qrk.sh/web/library/Drawer";

export const handle = { drawer: "right" };

export default function RightDrawerLayout() {
  return (
    <Drawer side="right" aria-label="Compose drawer">
      <Outlet />
    </Drawer>
  );
}
