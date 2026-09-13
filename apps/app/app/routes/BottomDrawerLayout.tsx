import { Outlet } from "react-router";
import { BottomDrawer } from "../[username]/site/[siteId]/Drawers/BottomDrawer";

export const handle = { drawer: "bottom" };

export default function BottomDrawerLayout() {
  return (
    <BottomDrawer>
      <Outlet />
    </BottomDrawer>
  );
}
