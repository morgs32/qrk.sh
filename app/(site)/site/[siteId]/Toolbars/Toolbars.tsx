"use client";

import { AnimatePresence, LayoutGroup } from "framer-motion";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { BrickCatalogToolbar } from "./BrickCatalogToolbar";
import { SiteToolbar } from "./SiteToolbar";
import { matchPagePathname } from "../routePatterns";
import { ComposeToolbar } from "./ComposeToolbar";

export function Toolbars() {
  const pathname = usePathname();
  const match = useMemo(() => matchPagePathname(pathname), [pathname]);

  const render = useMemo(() => {
    switch (match?.data) {
      case "brickCatalog":
        return <BrickCatalogToolbar key="brick-catalog-toolbar" />;
      case "compose":
        return <ComposeToolbar key="compose-toolbar" />;
      case "pageSettings":
      case "siteSettings":
      case "breakpoints":
        return null;
      default:
        return <SiteToolbar key="default" />;
    }
  }, [match?.data]);

  return (
    <LayoutGroup>
      <AnimatePresence mode="popLayout">{render}</AnimatePresence>
    </LayoutGroup>
  );
}
