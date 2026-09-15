import { Outlet } from "react-router";
import { LeftDrawer } from "../[username]/site/[siteId]/Drawers/LeftDrawer";

export const handle = { drawer: "left" };

export default function LeftDrawerLayout() {
  return (
    <LeftDrawer>
      <Outlet />
    </LeftDrawer>
  );
}
