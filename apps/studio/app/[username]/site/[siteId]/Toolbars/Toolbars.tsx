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
    route === "breakpoints" || isBrickDrawer ? (
      <BreakpointsToolbar key="Breakpoints" inBrickDrawer={isBrickDrawer} />
    ) : route === undefined || route === "compose" ? (
      <SiteToolbar key="Site" />
    ) : null;
  return (
    <LayoutGroup>
      <AnimatePresence mode="sync">{toolbar}</AnimatePresence>
    </LayoutGroup>
  );
}
