"use client";

import { AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { LeftDrawer } from "./LeftDrawer";
import { RightDrawer } from "./RightDrawer";
import { matchDrawerPathname } from "./matchDrawerPathname";

export function Drawers() {
  const pathname = usePathname();
  const match = useMemo(() => matchDrawerPathname(pathname), [pathname]);

  const render = useMemo(() => {
    switch (match?.data) {
      case "brickCatalog":
      case "brickDetail":
        return <LeftDrawer key="left" data={match.data} />;
      case "compose":
        return <RightDrawer key="right" data={match.data} />;
      default:
        return null;
    }
  }, [match?.data]);

  return <AnimatePresence>{render}</AnimatePresence>;
}
