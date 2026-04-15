"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { Breakpoints } from "../page/[pageId]/Breakpoints/Breakpoints";
import { PageSettings } from "../page/[pageId]/PageSettings/PageSettings";
import { SiteSettings } from "../page/[pageId]/SiteSettings/SiteSettings";

const drawerTransition = {
  duration: 0.3,
  ease: [0, 0, 0.2, 1] as const,
};

export function BottomDrawer(props: {
  data: "pageSettings" | "siteSettings" | "breakpoints";
}) {
  const { data } = props;

  const render = useMemo(() => {
    switch (data) {
      case "pageSettings":
        return (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <PageSettings />
          </div>
        );
      case "siteSettings":
        return (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <SiteSettings />
          </div>
        );
      case "breakpoints":
        return (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <Breakpoints />
          </div>
        );
    }
  }, [data]);

  return (
    <motion.div
      key="bottom-drawer"
      role="dialog"
      aria-hidden={false}
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={drawerTransition}
      className={cn(
        "fixed right-0 bottom-0 left-0 z-40 flex min-h-0 w-full flex-col border-t border-border bg-background shadow-[0_-4px_20px_-6px_rgb(0_0_0/0.07),0_-2px_10px_-4px_rgb(0_0_0/0.04)] top-16 md:top-auto md:h-[calc((100vh-4rem)/2)] dark:shadow-[0_-4px_20px_-6px_rgb(0_0_0/0.2),0_-2px_10px_-4px_rgb(0_0_0/0.1)]",
      )}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{render}</div>
    </motion.div>
  );
}
