"use client";

import { useNavigate } from "@tanstack/react-router";

import { BREAKPOINTS } from "@qrk.sh/library/breakpoints";
import { WallPreviewToolbar } from "@qrk.sh/library/WallPreviewToolbar";
import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";
import { Schema } from "effect";
import { motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";

import { useValidatedParams } from "@/hooks/useValidatedParams";

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
  const { availableWidth, activeBreakpoint, setSelectedBreakpoint } = useWallViewport();

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
            aria-pressed={activeBreakpoint === row.id}
            disabled={row.previewWidth > availableWidth}
            onClick={() => setSelectedBreakpoint(row.id)}
            className={
              activeBreakpoint === row.id
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
