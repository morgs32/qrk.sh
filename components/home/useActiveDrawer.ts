"use client";

import { usePathname } from "next/navigation";

export type IHomeDrawerPathParsed = {
  isTileDrawerOpen: boolean;
  tileId: string | null;
  isProseDrawerOpen: boolean;
};

export function parseHomeDrawerPathname(pathname: string): IHomeDrawerPathParsed {
  if (pathname === "/edit-text") {
    return { isTileDrawerOpen: false, tileId: null, isProseDrawerOpen: true };
  }
  if (pathname === "/edit-tiles") {
    return { isTileDrawerOpen: true, tileId: null, isProseDrawerOpen: false };
  }
  const prefix = "/edit-tiles/";
  if (pathname.startsWith(prefix)) {
    const rest = pathname.slice(prefix.length);
    if (rest.length > 0 && !rest.includes("/")) {
      try {
        return {
          isTileDrawerOpen: true,
          tileId: decodeURIComponent(rest),
          isProseDrawerOpen: false,
        };
      } catch {
        return { isTileDrawerOpen: false, tileId: null, isProseDrawerOpen: false };
      }
    }
  }
  return { isTileDrawerOpen: false, tileId: null, isProseDrawerOpen: false };
}

export type IDrawerMode = "edit-tiles" | "edit-text";

export function useActiveDrawer(mode: IDrawerMode): boolean {
  const pathname = usePathname();
  const parsed = parseHomeDrawerPathname(pathname);
  if (mode === "edit-tiles") {
    return parsed.isTileDrawerOpen;
  }
  return parsed.isProseDrawerOpen;
}
