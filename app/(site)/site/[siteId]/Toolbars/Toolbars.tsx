"use client";

import { AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { BrickCatalogToolbar } from "./BrickCatalogToolbar";
import { SiteToolbar } from "./SiteToolbar";
import { matchPagePathname } from "../routePatterns";

export function Toolbars() {
  const pathname = usePathname();
  const match = useMemo(() => matchPagePathname(pathname), [pathname]);

  const render = useMemo(() => {
    switch (match?.data) {
      case "brickCatalog":
        return <BrickCatalogToolbar key="brick-catalog-toolbar" />;
      default:
        return <SiteToolbar key="default" />;
    }
  }, [match?.data]);

  return <AnimatePresence>{render}</AnimatePresence>;
}
