import { Fragment } from "react";
import { AnimatePresence } from "framer-motion";
import { useMatches, useOutlet } from "react-router";

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
  return (
    <AnimatePresence mode="sync">
      <Fragment key={group}>{outlet}</Fragment>
    </AnimatePresence>
  );
}
