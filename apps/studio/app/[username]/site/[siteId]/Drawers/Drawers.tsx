import { useMatches, useOutlet } from "react-router";
import { DrawerPresence } from "@qrk.sh/web/library/Drawer";

export function Drawers() {
  const outlet = useOutlet();
  const matches = useMatches();
  const drawerMatch = matches.find(
    ({ handle }) => typeof handle === "object" && handle !== null && "drawer" in handle,
  );
  const handle = drawerMatch?.handle;
  const group =
    typeof handle === "object" &&
    handle !== null &&
    "drawer" in handle &&
    typeof handle.drawer === "string"
      ? handle.drawer
      : "page";

  // Retain the matched route element and its params until this group's exit finishes.
  return <DrawerPresence group={group}>{outlet}</DrawerPresence>;
}
