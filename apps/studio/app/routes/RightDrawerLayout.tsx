import { Outlet } from "react-router";
import { RightDrawer } from "../[username]/site/[siteId]/Drawers/RightDrawer";

export const handle = { drawer: "right" };

export default function RightDrawerLayout() {
  return (
    <RightDrawer>
      <Outlet />
    </RightDrawer>
  );
}
