"use client";

import Link from "next/link";

import { ModuleFilmstrip } from "@qrk.sh/library/ModuleFilmstrip";
import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";
import { Schema } from "effect";

import { useValidatedParams } from "@/hooks/useValidatedParams";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: Schema.String,
});

export function Modules() {
  const { activeBreakpoint } = useWallViewport();
  const breakpoint = activeBreakpoint ?? "sm";
  const params = useValidatedParams(ParamsSchema);
  const base = `/${encodeURIComponent(params.username)}/site/${encodeURIComponent(params.siteId)}/page/${encodeURIComponent(params.pageId)}`;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 font-mono text-sm leading-5 text-zinc-900">
        <ModuleFilmstrip
          breakpoint={breakpoint}
          renderModuleLink={(brickModule) => (
            <Link
              href={`${base}/modules/${encodeURIComponent(brickModule.id)}`}
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
