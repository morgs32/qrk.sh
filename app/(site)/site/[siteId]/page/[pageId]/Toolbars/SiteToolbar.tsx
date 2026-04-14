"use client";

import { useMemo } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { brickCatalogPattern, pagePattern } from "../../../routePatterns";
import { BottomToolbar } from "./BottomToolbar";

export function SiteToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ siteId: string; pageId: string }>();
  const siteId = params.siteId;
  const pageId = params.pageId;

  return (
    <div className="pointer-events-none fixed bottom-6 left-0 right-0 z-30 flex justify-center px-4">
      <div className="pointer-events-auto">
        <BottomToolbar />
      </div>
    </div>
  );
}
