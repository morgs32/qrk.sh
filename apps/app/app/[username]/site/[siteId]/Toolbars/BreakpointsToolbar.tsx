"use client";

import { useNavigate, useSearch } from "@tanstack/react-router";
import { Laptop, Monitor, Smartphone, Tablet } from "lucide-react";

import { BREAKPOINTS } from "../../../../../lib/breakpoints";
import { ToolbarButton } from "./ToolbarButton";
import { WallPreviewToolbar } from "./WallPreviewToolbar";

/** Breakpoint selection for the Wall preview. */
export function BreakpointsToolbar() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/$username/site/$siteId/page/$pageId" });

  return (
    <WallPreviewToolbar aria-label="Breakpoints" size="sm">
      {BREAKPOINTS.map((row) => {
        const Icon = { sm: Smartphone, md: Tablet, lg: Laptop, xl: Monitor }[row.id];
        return (
          <ToolbarButton
            key={row.id}
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
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {row.id}
          </ToolbarButton>
        );
      })}
    </WallPreviewToolbar>
  );
}
