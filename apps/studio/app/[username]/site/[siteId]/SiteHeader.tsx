"use client";

import { useSyncExternalStore } from "react";
import { userSession } from "@/zerospin/userSession";
import { Skeleton } from "@/components/ui/skeleton";
import { Wordmark } from "./Wordmark";

export function SiteHeader() {
  const isInitialized = useSyncExternalStore(
    userSession.store.subscribe,
    () => userSession.store.getState().isInitialized,
    () => false,
  );
  return (
    <header
      data-testid="site-navbar"
      className="qrk-responsive-insets z-50 flex h-16 shrink-0 items-center justify-between border-b border-border bg-background [padding-inline:var(--qrk-inset-inline)]"
    >
      {isInitialized ? (
        <Wordmark />
      ) : (
        <Skeleton className="h-5 w-32" aria-label="Loading site name" />
      )}
      {/* <nav className="flex items-center gap-6">
        <Link to="/work" className="text-xs transition-opacity hover:opacity-70">
          Work
        </Link>
        <Link to="/about" className="text-xs transition-opacity hover:opacity-70">
          About
        </Link>
        <Link to="/follow" className="text-xs transition-opacity hover:opacity-70">
          Follow
        </Link>
      </nav> */}
      {/* <button
        type="button"
        className="rounded-full bg-foreground px-3 py-1.5 text-[10px] text-background transition-opacity hover:opacity-90"
      >
        START A PROJECT
      </button> */}
    </header>
  );
}
