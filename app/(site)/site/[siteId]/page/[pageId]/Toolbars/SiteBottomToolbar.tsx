"use client";

import { useMemo } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { BottomToolbar } from "./BottomToolbar";

export function SiteBottomToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ siteId: string; pageId: string }>();
  const siteId = params.siteId;
  const pageId = params.pageId;

  const nextPath = useMemo(() => {
    const basePath = `/site/${siteId}/page/${pageId}`;
    const isBrickCatalog =
      pathname === `${basePath}/brick-catalog` || pathname.startsWith(`${basePath}/brick/`);
    const isCompose = pathname === `${basePath}/compose`;

    return {
      basePath,
      isBrickCatalog,
      isCompose,
    };
  }, [pathname, siteId, pageId]);

  return (
    <div className="pointer-events-none fixed bottom-6 left-0 right-0 z-30 flex justify-center px-4">
      <div className="pointer-events-auto">
        <BottomToolbar
          addBricksOpen={nextPath.isBrickCatalog}
          composeOpen={nextPath.isCompose}
          onBricksToolbarClick={() => {
            router.push(
              nextPath.isBrickCatalog ? nextPath.basePath : `${nextPath.basePath}/brick-catalog`,
            );
          }}
          onComposeClick={() => {
            router.push(nextPath.isCompose ? nextPath.basePath : `${nextPath.basePath}/compose`);
          }}
        />
      </div>
    </div>
  );
}
