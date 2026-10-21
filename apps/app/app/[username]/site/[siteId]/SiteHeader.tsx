"use client";

import { Suspense } from "react";
import { useUser } from "@clerk/react";
import { useMatches } from "@tanstack/react-router";
import { useLiveQuery } from "@zerospin/react";
import { Schema } from "effect";
import { cn } from "cn";
import { Skeleton } from "@/components/ui/skeleton";
import { UserUI } from "@/zerospin/UserUI";
import { useValidatedParams } from "@/hooks/useValidatedParams";
import { Wordmark } from "./Wordmark";
import { useSiteStore } from "./siteStore";

const ParamsSchema = Schema.Struct({ siteId: Schema.TemplateLiteral(["sit_", Schema.String]) });

export function SiteHeader() {
  const { isLoaded, user } = useUser();
  const { siteId } = useValidatedParams(ParamsSchema);
  const session = UserUI.useSession();
  const { data: site } = useLiveQuery({
    session,
    key: siteId,
    query: (db, id) => db.query.site.findFirst({ where: { id: { eq: id } } }),
  });
  const draft = useSiteStore((state) => state.site);
  const settingsOpen = useMatches({
    select: (matches) =>
      matches.some(
        (match) => match.routeId === "/$username/site/$siteId/page/$pageId/_drawer/site-settings",
      ),
  });
  const stickyNavbar = settingsOpen && draft?.id === siteId ? draft.stickyNavbar : site?.stickyNavbar;
  return (
    <header
      data-testid="site-navbar"
      className={cn(
        "qrk-responsive-insets z-50 flex h-16 shrink-0 items-center justify-between border-b border-border bg-background [padding-inline:var(--qrk-inset-inline)]",
        stickyNavbar && "sticky top-0",
      )}
    >
      {isLoaded && user ? (
        <Suspense fallback={<Skeleton className="h-5 w-32" aria-label="Loading site name" />}>
          <Wordmark />
        </Suspense>
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
