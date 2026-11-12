"use client";

import { makeIdSchema } from "@zerospin/sdk/browser";
import { userSessionDefinition } from "@/zerospin/userSessionDefinition";
import { useLiveQuery, useSession } from "@zerospin/react";
import { useSearch } from "@tanstack/react-router";

import { ModuleFilmstrip } from "./ModuleFilmstrip";
import { BREAKPOINTS } from "../../../../../../../lib/breakpoints";
import { pageV1 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { siteV1 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { Schema } from "effect";

import { useValidatedParams } from "@/hooks/useValidatedParams";
import NotFound from "@/app/not-found";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: makeIdSchema(Site),
  pageId: makeIdSchema(Page),
});

export function Modules() {
  const search = useSearch({ from: "/$username/site/$siteId/page/$pageId" });
  const breakpoint = BREAKPOINTS.find((entry) => entry.id === search.breakpoint);
  const params = useValidatedParams(ParamsSchema);
  const session = useSession(userSessionDefinition);
  const { data: site } = useLiveQuery({
    session,
    key: params.siteId,
    query: (db, id) => db.query.site.findFirst({ where: { id: { eq: id } } }),
  });
  if (site === undefined) return <NotFound />;
  if (breakpoint === undefined) return null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 text-sm leading-5 text-zinc-900">
        <ModuleFilmstrip breakpoint={breakpoint.id} cardStyle={site.cardStyle} />
      </div>
    </div>
  );
}
