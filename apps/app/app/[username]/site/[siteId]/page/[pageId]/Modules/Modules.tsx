"use client";

import { Link } from "@tanstack/react-router";

import { ModuleFilmstrip } from "@qrk.sh/library/ModuleFilmstrip";
import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";
import { pageV2 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV2";
import { makeModelIdSchema } from "@zerospin/core/models/make/makeModelIdSchema";
import { Schema } from "effect";

import { useValidatedParams } from "@/hooks/useValidatedParams";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: makeModelIdSchema(Page),
});

export function Modules() {
  const { activeBreakpoint } = useWallViewport();
  const breakpoint = activeBreakpoint ?? "sm";
  const params = useValidatedParams(ParamsSchema);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 font-mono text-sm leading-5 text-zinc-900">
        <ModuleFilmstrip
          breakpoint={breakpoint}
          renderModuleLink={(brickModule) => (
            <Link
              to="/$username/site/$siteId/page/$pageId/modules/$moduleId"
              params={{ ...params, moduleId: brickModule.id }}
              resetScroll={false}
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
