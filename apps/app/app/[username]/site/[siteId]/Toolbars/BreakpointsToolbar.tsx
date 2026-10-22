"use client";

import { useNavigate, useSearch } from "@tanstack/react-router";

import { BREAKPOINTS } from "../../../../../modules/lib/breakpoints";
import { WallPreviewToolbar } from "../../../../../modules/lib/WallPreviewToolbar";
import { Schema } from "effect";
import { motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";

import { useValidatedParams } from "@/hooks/useValidatedParams";
import { useEditorViewportStore } from "@/stores/useEditorViewportStore";

import { ToolbarSeparator } from "./ToolbarSeparator";
import { ToolbarButton } from "./ToolbarButton";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: Schema.String,
});

const toolbarPresenceTransition = {
  duration: 0.3,
  ease: [0, 0, 0.2, 1] as const,
};

/** Standalone breakpoint preview controls for the /breakpoints route. */
export function BreakpointsToolbar() {
  const reducedMotion = useReducedMotion();
  const params = useValidatedParams(ParamsSchema);
  const navigate = useNavigate();
  const search = useSearch({ from: "/$username/site/$siteId/page/$pageId" });
  const availableWidth = useEditorViewportStore((state) => state.availableWidth);

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
        className="rounded-full border-border/80 bg-background px-1.5 shadow-md"
      >
        {BREAKPOINTS.map((row) => (
          <ToolbarButton
            key={row.id}
            tooltip={`${row.id} (${row.previewWidth}px)`}
            aria-label={`${row.id} preview width`}
            aria-pressed={search.breakpoint === row.id}
            disabled={availableWidth === null || row.previewWidth > availableWidth}
            onClick={() =>
              navigate({
                to: ".",
                search: (previous) => ({
                  ...previous,
                  breakpoint: row.id,
                  insertion: undefined,
                }),
                resetScroll: false,
              })
            }
            className={
              search.breakpoint === row.id
                ? "h-7 px-2 text-[13px] font-normal text-foreground"
                : "h-7 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
            }
          >
            {row.id}
          </ToolbarButton>
        ))}

        <ToolbarSeparator />

        <ToolbarButton
          tooltip="Close"
          aria-label="Close"
          onClick={() =>
            navigate({
              to: "/$username/site/$siteId/page/$pageId",
              params,
              search: { breakpoint: search.breakpoint },
              resetScroll: false,
            })
          }
          className="h-7 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </ToolbarButton>
      </WallPreviewToolbar>
    </motion.div>
  );
}
