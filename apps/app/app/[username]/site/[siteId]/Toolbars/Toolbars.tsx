"use client";

import { AnimatePresence, LayoutGroup } from "framer-motion";

import { TooltipProvider } from "@/components/ui/tooltip";

import { SiteToolbar } from "./SiteToolbar";

export function Toolbars() {
  return (
    <TooltipProvider delay={0}>
      <LayoutGroup>
        <div className="grid place-items-center">
          <AnimatePresence mode="sync">
            <SiteToolbar key="Site" />
          </AnimatePresence>
        </div>
      </LayoutGroup>
    </TooltipProvider>
  );
}
