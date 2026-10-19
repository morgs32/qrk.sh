"use client";

import { AnimatePresence, LayoutGroup } from "framer-motion";
import { useMatches } from "@tanstack/react-router";
import { SiteToolbar } from "./SiteToolbar";
import { BreakpointsToolbar } from "./BreakpointsToolbar";

export function Toolbars() {
  const route = useMatches({ select: (matches) => matches.at(-1)?.routeId });
  const toolbar =
    route === "/$username/site/$siteId/page/$pageId/breakpoints" ? (
      <BreakpointsToolbar key="Breakpoints" />
    ) : route === "/$username/site/$siteId/page/$pageId/" ? (
      <SiteToolbar key="Site" />
    ) : null;
  return (
    <LayoutGroup>
      <AnimatePresence mode="sync">{toolbar}</AnimatePresence>
    </LayoutGroup>
  );
}
