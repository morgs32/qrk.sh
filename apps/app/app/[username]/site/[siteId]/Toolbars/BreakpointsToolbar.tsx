"use client";

import { useMatches, useNavigate, useSearch } from "@tanstack/react-router";

import { BREAKPOINTS } from "../../../../../lib/breakpoints";
import { WallPreviewToolbar } from "./WallPreviewToolbar";
import { Schema } from "effect";
import { motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useValidatedParams } from "@/hooks/useValidatedParams";

import { ToolbarButton } from "./ToolbarButton";
import { ToolbarSeparator } from "./ToolbarSeparator";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: Schema.String,
});

const toolbarPresenceTransition = {
  duration: 0.3,
  ease: [0, 0, 0.2, 1] as const,
};

/** Breakpoint preview controls for breakpoint selection and the Bricks catalog. */
export function BreakpointsToolbar() {
  const reducedMotion = useReducedMotion();
  const isStandalone = useMatches({
    select: (matches) =>
      matches.at(-1)?.routeId === "/$username/site/$siteId/page/$pageId/breakpoints",
  });
  const params = useValidatedParams(ParamsSchema);
  const navigate = useNavigate();
  const search = useSearch({ from: "/$username/site/$siteId/page/$pageId" });

  return (
    <motion.div
      className="[grid-area:1/1]"
      layout
      layoutId="site-bottom-toolbar-shell"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={reducedMotion ? { duration: 0 } : toolbarPresenceTransition}
    >
      <WallPreviewToolbar
        aria-label="Breakpoints"
        className="border-border/80 bg-background shadow-md"
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
            className={
              search.breakpoint === row.id
                ? "h-7 px-2 text-[13px] font-bold text-foreground disabled:opacity-100"
                : "h-7 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
            }
          >
            {row.id}
          </ToolbarButton>
        ))}
        {isStandalone ? (
          <>
            <ToolbarSeparator />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close"
                  onClick={() =>
                    navigate({
                      to: "/$username/site/$siteId/page/$pageId",
                      params,
                      search: { breakpoint: search.breakpoint },
                      resetScroll: false,
                    })
                  }
                >
                  <X className="size-3.5" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={8}>
                Close
              </TooltipContent>
            </Tooltip>
          </>
        ) : null}
      </WallPreviewToolbar>
    </motion.div>
  );
}
