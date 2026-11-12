"use client";

import { useNavigate, useSearch } from "@tanstack/react-router";

import { BREAKPOINTS } from "../../../../../lib/breakpoints";
import { ToolbarButton } from "./ToolbarButton";
import { WallPreviewToolbar } from "./WallPreviewToolbar";

/** Breakpoint selection for the Wall preview. */
export function BreakpointsToolbar() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/$username/site/$siteId/page/$pageId" });

  return (
    <WallPreviewToolbar
      aria-label="Breakpoints"
      className="h-7 gap-0.5 rounded-full bg-muted p-0.5 [&>button]:h-full"
    >
      {BREAKPOINTS.map((row) => (
        <ToolbarButton
          key={row.id}
          tooltip={`${row.id} (${row.previewWidth}px)`}
          aria-label={`${row.id} preview width`}
          aria-pressed={search.breakpoint === row.id}
          disabled={search.breakpoint === row.id}
          onClick={() =>
            navigate({
              to: ".",
              search: (previous) => ({
                ...previous,
                breakpoint: row.id,
              }),
              resetScroll: false,
            })
          }
          className="rounded-full px-1.5 text-xs font-normal text-muted-foreground hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm disabled:opacity-100 sm:px-2"
        >
          {row.id}
        </ToolbarButton>
      ))}
    </WallPreviewToolbar>
  );
}
