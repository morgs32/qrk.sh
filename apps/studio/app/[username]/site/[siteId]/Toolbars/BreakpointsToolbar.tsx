"use client";

import { BREAKPOINTS } from "@qrk.sh/library/breakpoints";
import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";
import { Schema } from "effect";
import { motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { href, useNavigate } from "react-router";

import { useValidatedParams } from "@/hooks/useValidatedParams";

import { BottomToolbar, ToolbarSeparator } from "./BottomToolbar";
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

/** Figma: floating breakpoints preview toolbar (sm/md/lg/xl). */
export function BreakpointsToolbar() {
  const reducedMotion = useReducedMotion();
  const params = useValidatedParams(ParamsSchema);
  const navigate = useNavigate();
  const { availableWidth, activeBreakpoint, setSelectedBreakpoint } = useWallViewport();

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-30 -translate-x-1/2 md:left-[25%]">
      <div className="pointer-events-auto" role="toolbar" aria-label="Breakpoints">
        <motion.div
          layout
          layoutId="site-bottom-toolbar-shell"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reducedMotion ? { duration: 0 } : toolbarPresenceTransition}
        >
          <BottomToolbar className="rounded-full border-border/80 bg-background px-1.5 py-1 shadow-md">
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
              onClick={() => navigate(href("/:username/site/:siteId/page/:pageId", { ...params }))}
              className="h-7 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </ToolbarButton>
          </BottomToolbar>
        </motion.div>
      </div>
    </div>
  );
}
