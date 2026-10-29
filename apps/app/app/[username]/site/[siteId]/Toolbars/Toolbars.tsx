"use client";

import { AnimatePresence, LayoutGroup } from "framer-motion";
import { useMatches } from "@tanstack/react-router";

import { TooltipProvider } from "@/components/ui/tooltip";

import { SiteToolbar } from "./SiteToolbar";
import { BreakpointsToolbar } from "./BreakpointsToolbar";

export function Toolbars() {
  const route = useMatches({ select: (matches) => matches.at(-1)?.routeId });
  const toolbar =
    route === "/$username/site/$siteId/page/$pageId/breakpoints" ||
    route === "/$username/site/$siteId/page/$pageId/_drawer/modules/" ||
    route === "/$username/site/$siteId/page/$pageId/_drawer/modules/$moduleId" ||
    route === "/$username/site/$siteId/page/$pageId/_drawer/stack/$stackId" ||
    route === "/$username/site/$siteId/page/$pageId/_drawer/brick/$brickId" ? (
      <BreakpointsToolbar key="Breakpoints" />
    ) : route === "/$username/site/$siteId/page/$pageId/" ? (
      <SiteToolbar key="Site" />
    ) : null;
  return (
    <TooltipProvider delayDuration={0}>
      <LayoutGroup>
        <div className="grid place-items-center">
          <AnimatePresence mode="sync">{toolbar}</AnimatePresence>
        </div>
      </LayoutGroup>
    </TooltipProvider>
  );
}
