"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { ModuleFilmstrip } from "@qrk.sh/library/ModuleFilmstrip";
import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";
import { Schema } from "effect";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useValidatedParams } from "@/hooks/useValidatedParams";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: Schema.String,
});

export function BrickGroup() {
  const { activeBreakpoint } = useWallViewport();
  const breakpoint = activeBreakpoint ?? "sm";
  const params = useValidatedParams(ParamsSchema);
  const router = useRouter();
  const base = `/${encodeURIComponent(params.username)}/site/${encodeURIComponent(params.siteId)}/page/${encodeURIComponent(params.pageId)}`;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col gap-4 border-b border-border/60 bg-background/95 px-6 pb-5 pt-6 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm">Bricks</div>
            <div className="text-xs text-muted-foreground">
              Browse bricks by module. Drag a brick onto your page.
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="cursor-pointer"
            aria-label="Close drawer"
            onClick={() =>
              router.push(
                `/${encodeURIComponent(params.username)}/site/${encodeURIComponent(params.siteId)}/page/${encodeURIComponent(params.pageId)}`,
              { scroll: false },
              )
            }
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 font-mono text-sm leading-5 text-zinc-900">
        <ModuleFilmstrip
          breakpoint={breakpoint}
          renderModuleLink={(brickModule) => (
            <Link
              href={`${base}/brick-group/${encodeURIComponent(brickModule.id)}`}
              scroll={false}
              data-module-link={brickModule.id}
            >
              {brickModule.label}
            </Link>
          )}
        />
      </div>
    </div>
  );
}
