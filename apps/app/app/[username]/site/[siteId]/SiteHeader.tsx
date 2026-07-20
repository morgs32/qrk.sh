"use client";

import { Schema } from "effect";
import Link from "next/link";

import { useValidatedParams } from "@/hooks/useValidatedParams";

import { pagePattern } from "./routePatterns";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: Schema.optional(Schema.String),
});

export function SiteHeader() {
  const { username, siteId, pageId } = useValidatedParams(ParamsSchema);

  return (
    <header className="z-50 flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-6">
      {pageId === undefined ? (
        <span className="text-sm font-medium">Garlott</span>
      ) : (
        <Link href={pagePattern.href({ username, siteId, pageId })} className="text-sm font-medium">
          Garlott
        </Link>
      )}
      {/* <nav className="flex items-center gap-6">
        <Link href="/work" className="text-xs transition-opacity hover:opacity-70">
          Work
        </Link>
        <Link href="/about" className="text-xs transition-opacity hover:opacity-70">
          About
        </Link>
        <Link href="/follow" className="text-xs transition-opacity hover:opacity-70">
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
