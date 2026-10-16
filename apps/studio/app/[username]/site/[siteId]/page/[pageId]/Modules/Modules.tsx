"use client";

import Link from "next/link";

import { ModuleFilmstrip } from "@qrk.sh/library/ModuleFilmstrip";
import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";
import { pageV2 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV2";
import { makeModelIdSchema } from "@zerospin/core/models/make/makeModelIdSchema";
import { useLiveQuery } from "@zerospin/react";
import { Schema } from "effect";

import { useValidatedParams } from "@/hooks/useValidatedParams";
import { UserApp } from "@/zerospin/userSession";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: makeModelIdSchema(Page),
});

export function Modules() {
  const { activeBreakpoint } = useWallViewport();
  const breakpoint = activeBreakpoint ?? "sm";
  const params = useValidatedParams(ParamsSchema);
  const session = UserApp.useInitializedSession();
  const { data: page } = useLiveQuery({
    session,
    key: params.pageId,
    query: (db, pageId) => db.query.page.findFirst({ where: { id: { eq: pageId } } }),
  });
  const bricksQuery = useLiveQuery({
    session,
    key: page?.wallId,
    query: (db, wallId) =>
      db.query.brick.findMany({ where: { wallId: { eq: wallId ?? "wal_missing" } } }),
  });
  const base = `/${encodeURIComponent(params.username)}/site/${encodeURIComponent(params.siteId)}/page/${encodeURIComponent(params.pageId)}`;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 font-mono text-sm leading-5 text-zinc-900">
        <ModuleFilmstrip
          breakpoint={breakpoint}
          wallBricks={bricksQuery.data}
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
