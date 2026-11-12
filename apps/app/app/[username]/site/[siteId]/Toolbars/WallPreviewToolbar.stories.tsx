import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { ToolbarButton } from "@/app/[username]/site/[siteId]/Toolbars/ToolbarButton";
import { TooltipProvider } from "@/components/ui/tooltip";

import { BREAKPOINTS } from "../../../../../lib/breakpoints";
import { WallPreviewToolbar } from "./WallPreviewToolbar";

const meta = {
  title: "Components/Floating Toolbar",
  tags: ["!dev"],
  component: WallPreviewToolbar,
  parameters: { layout: "fullscreen", controls: { disable: true } },
} satisfies Meta<typeof WallPreviewToolbar>;

export default meta;

export const BreakpointPicker: StoryObj = {
  render: function RenderBreakpointPicker() {
    const [breakpoint, setBreakpoint] = useState<(typeof BREAKPOINTS)[number]>(BREAKPOINTS[0]);

    return (
      <div className="wall-preview-viewport flex min-h-dvh justify-center bg-muted px-4 pt-8 pb-20">
        <div
          className="wall-preview-frame w-full rounded-(--wall-frame-radius) border border-border bg-background p-6"
          style={{ maxWidth: breakpoint.previewWidth }}
        >
          <h2 className="font-semibold">Page preview</h2>
          <p className="text-sm text-muted-foreground">{breakpoint.previewWidth}px breakpoint</p>
        </div>
        <div className="pointer-events-none fixed inset-x-0 bottom-(--wall-preview-toolbar-gap) flex justify-center px-2">
          <TooltipProvider delay={0}>
            <WallPreviewToolbar aria-label="Breakpoints" size="sm">
              {BREAKPOINTS.map((row) => (
                <ToolbarButton
                  key={row.id}
                  aria-label={`${row.id} preview width`}
                  aria-pressed={breakpoint.id === row.id}
                  onClick={() => setBreakpoint(row)}
                >
                  {row.id}
                </ToolbarButton>
              ))}
            </WallPreviewToolbar>
          </TooltipProvider>
        </div>
      </div>
    );
  },
};
