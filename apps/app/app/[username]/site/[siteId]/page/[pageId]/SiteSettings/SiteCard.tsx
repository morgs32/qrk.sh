"use client";

import { MoreHorizontal } from "lucide-react";

export function SiteCard({
  title,
  url,
  publishedAt,
  logoSrc = "/android-chrome-512x512.png",
}: {
  title: string;
  url: string;
  publishedAt: string;
  logoSrc?: string;
}) {
  return (
    <div className="w-full rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="relative size-8 shrink-0 overflow-hidden rounded-md">
            <img
              loading="lazy"
              src={logoSrc}
              alt={`${title} logo`}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
              className="object-cover"
              sizes="32px"
            />
          </div>

          <div className="min-w-0">
            <div className="truncate text-lg font-medium leading-tight text-foreground">
              {title}
            </div>
            <div className="truncate text-foreground/70">{url}</div>
          </div>
        </div>

        <button
          type="button"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Open site card menu"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </div>

      <div className="mt-5 text-foreground/70">{publishedAt}</div>
    </div>
  );
}
