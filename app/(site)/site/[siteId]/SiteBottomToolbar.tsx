"use client";

import { useMemo } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { BottomToolbar } from "./BottomToolbar";

export function SiteBottomToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ siteId: string }>();
  const siteId = params.siteId;

  const nextPath = useMemo(() => {
    const basePath = `/site/${siteId}`;
    const isEditBricks =
      pathname === `${basePath}/edit-bricks` || pathname.startsWith(`${basePath}/brick/`);
    const isEditText = pathname === `${basePath}/edit-text`;

    return {
      basePath,
      isEditBricks,
      isEditText,
    };
  }, [pathname, siteId]);

  return (
    <div className="pointer-events-none fixed bottom-6 left-0 right-0 z-30 flex justify-center px-4">
      <div className="pointer-events-auto">
        <BottomToolbar
          addBricksOpen={nextPath.isEditBricks}
          editTextOpen={nextPath.isEditText}
          onBricksToolbarClick={() => {
            router.push(
              nextPath.isEditBricks ? nextPath.basePath : `${nextPath.basePath}/edit-bricks`,
            );
          }}
          onEditTextClick={() => {
            router.push(nextPath.isEditText ? nextPath.basePath : `${nextPath.basePath}/edit-text`);
          }}
        />
      </div>
    </div>
  );
}
