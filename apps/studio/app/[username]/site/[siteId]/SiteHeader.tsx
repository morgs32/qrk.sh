"use client";

import { Wordmark } from "./Wordmark";

export function SiteHeader() {
  return (
    <header className="z-50 flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-6">
      <Wordmark />
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
