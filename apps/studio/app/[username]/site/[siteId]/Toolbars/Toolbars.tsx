"use client";

import { AnimatePresence, LayoutGroup } from "framer-motion";
import { useSelectedLayoutSegments } from "next/navigation";
import { SiteToolbar } from "./SiteToolbar";
import { BreakpointsToolbar } from "./BreakpointsToolbar";

export function Toolbars() {
  const segments = useSelectedLayoutSegments();
  const isBrickDrawer = segments.includes("(bricks)");
  const route = segments.find((segment) => !segment.startsWith("("));
  const toolbar =
    route === "breakpoints" || route === "page-settings" || isBrickDrawer ? (
      <BreakpointsToolbar
        key="Breakpoints"
        aboveDrawer={isBrickDrawer || route === "page-settings"}
      />
    ) : route === undefined ? (
      <SiteToolbar key="Site" />
    ) : null;
  return (
    <LayoutGroup>
      <AnimatePresence mode="sync">{toolbar}</AnimatePresence>
    </LayoutGroup>
  );
}
