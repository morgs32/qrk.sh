"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { SiteToolbar } from "../page/[pageId]/Toolbars/SiteToolbar";
import { matchPagePathname } from "../routePatterns";

export function Toolbars() {
  const pathname = usePathname();
  const match = useMemo(() => matchPagePathname(pathname), [pathname]);

  const render = useMemo(() => {
    switch (match?.data) {
      case "brickCatalog":
      case "brickDetail":
      case "compose":
        return <SiteToolbar key="bottom" />;
      default:
        return null;
    }
  }, [match?.data]);

  return <>{render}</>;
}
