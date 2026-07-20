"use client";

import { BREAKPOINT_ROWS } from "../page/[pageId]/Breakpoints/breakpointRows";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Former SiteToolbar popover body; kept for possible reuse. */
export function BreakpointsPopoverContent() {
  return (
    <TooltipProvider delayDuration={0}>
      <div className="w-72 p-3">
        <div className="flex flex-col gap-1.5 text-sm">
          {BREAKPOINT_ROWS.map((row) => {
            const Icon = row.Icon;
            return (
              <div key={row.prefix} className="flex min-w-0 items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={row.typicalDevice}
                        className="inline-flex shrink-0 cursor-default items-center justify-center rounded-sm border-0 bg-transparent p-0.5 text-muted-foreground outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {Icon && <Icon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{row.typicalDevice}</TooltipContent>
                  </Tooltip>
                  <span className="shrink-0 text-left">{row.prefix}</span>
                </div>
                <span className="shrink-0 text-right font-mono tabular-nums text-muted-foreground">
                  {row.minWidth}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
