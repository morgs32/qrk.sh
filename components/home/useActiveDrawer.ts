"use client";

import { usePathname } from "next/navigation";

export type IHomeDrawerPathParsed = {
  isTileDrawerOpen: boolean;
  tileId: string | null;
  isProseDrawerOpen: boolean;
};

export function parseHomeDrawerPathname(pathname: string): IHomeDrawerPathParsed {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "site" || segments.length < 2) {
    return { isTileDrawerOpen: false, tileId: null, isProseDrawerOpen: false };
  }
  const rest = segments.slice(2);
  if (rest.length === 0) {
    return { isTileDrawerOpen: false, tileId: null, isProseDrawerOpen: false };
  }
  if (rest[0] === "edit-text" && rest.length === 1) {
    return { isTileDrawerOpen: false, tileId: null, isProseDrawerOpen: true };
  }
  if (rest[0] === "edit-tiles") {
    if (rest.length === 1) {
      return { isTileDrawerOpen: true, tileId: null, isProseDrawerOpen: false };
    }
    if (rest.length === 3) {
      return {
        isTileDrawerOpen: true,
        tileId: rest[2],
        isProseDrawerOpen: false,
      };
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
