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

export function LeftDrawer(props: { data: "brickCatalog" | "brickDetail" }) {
  const { data } = props;

  const render = useMemo(() => {
    switch (data) {
      case "brickCatalog":
        return <BrickCatalog />;
      case "brickDetail":
        return <BrickDetail />;
    }
  }, [data]);

  return (
    <motion.div
      key="left-drawer"
      role="dialog"
      aria-hidden={false}
      initial={{ x: "-100%" }}
      animate={{ x: 0 }}
      exit={{ x: "-100%" }}
      transition={drawerTransition}
      className={cn(
        "fixed top-16 bottom-0 left-0 z-40 flex h-[calc(100vh-4rem)] w-full min-h-0 flex-col border-r border-border bg-background shadow-[4px_0_20px_-6px_rgb(0_0_0/0.07),2px_0_10px_-4px_rgb(0_0_0/0.04)] md:w-1/2 dark:shadow-[4px_0_20px_-6px_rgb(0_0_0/0.2),2px_0_10px_-4px_rgb(0_0_0/0.1)]",
      )}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{render}</div>
    </motion.div>
  );
}
