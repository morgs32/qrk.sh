"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { BrickCatalog } from "../page/[pageId]/BrickCatalog/BrickCatalog";
import { BrickDetail } from "../page/[pageId]/BrickDetail/BrickDetail";

const drawerTransition = {
  duration: 0.3,
  ease: [0, 0, 0.2, 1] as const,
};

export function BottomDrawer(props: {
  data: "brickCatalog" | "brickDetail" | "pageSettings" | "siteSettings";
}) {
  const { data } = props;

  const render = useMemo(() => {
    switch (data) {
      case "brickCatalog":
        return <BrickCatalog />;
      case "brickDetail":
        return <BrickDetail />;
      case "pageSettings":
      case "siteSettings":
        return <div className="flex min-h-0 flex-1 flex-col" />;
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
        "fixed top-16 right-0 bottom-0 left-0 z-40 flex h-[calc(100vh-4rem)] min-h-0 w-full flex-col border-t border-border bg-background shadow-[0_-4px_20px_-6px_rgb(0_0_0/0.07),0_-2px_10px_-4px_rgb(0_0_0/0.04)] md:h-[calc((100vh-4rem)/2)] dark:shadow-[0_-4px_20px_-6px_rgb(0_0_0/0.2),0_-2px_10px_-4px_rgb(0_0_0/0.1)]",
      )}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{render}</div>
    </motion.div>
  );
}
