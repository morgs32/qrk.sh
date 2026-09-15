import { AnimatePresence, LayoutGroup } from "framer-motion";
import { useMatches } from "react-router";
import { isValidElement } from "react";

export function Toolbars() {
  const matches = useMatches();
  const handle = matches.at(-1)?.handle;
  const toolbar =
    typeof handle === "object" && handle !== null && "toolbar" in handle ? handle.toolbar : null;
  return (
    <LayoutGroup>
      <AnimatePresence mode="sync">{isValidElement(toolbar) ? toolbar : null}</AnimatePresence>
    </LayoutGroup>
  );
}
