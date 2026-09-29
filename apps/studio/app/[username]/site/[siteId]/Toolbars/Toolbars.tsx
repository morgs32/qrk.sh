"use client";

import { AnimatePresence, LayoutGroup } from "framer-motion";
import { useSelectedLayoutSegments } from "next/navigation";
import { SiteToolbar } from "./SiteToolbar";
import { BrickGroupToolbar } from "./BrickGroupToolbar";
import { BreakpointsToolbar } from "./BreakpointsToolbar";

export function Toolbars() {
  const segments = useSelectedLayoutSegments().filter((segment) => !segment.startsWith("("));
  const route = segments[0];
  const toolbar =
    route === "brick-group" && segments.length === 1 ? (
      <BrickGroupToolbar key="BrickGroup" />
    ) : route === "breakpoints" ? (
      <BreakpointsToolbar key="Breakpoints" />
    ) : route === undefined || route === "brick" || route === "compose" ? (
      <SiteToolbar key="Site" />
    ) : null;
  return (
    <LayoutGroup>
      <AnimatePresence mode="sync">{toolbar}</AnimatePresence>
    </LayoutGroup>
  );
}
