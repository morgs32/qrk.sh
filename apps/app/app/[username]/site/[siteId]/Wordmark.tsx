"use client";

import { Link, useMatches } from "@tanstack/react-router";
import { makeModelIdSchema } from "@zerospin/core/models/make/makeModelIdSchema";
import { useLiveQuery } from "@zerospin/react";
import { Schema } from "effect";
import { siteV3 } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV3";

import { UserUI } from "@/zerospin/UserUI";
import { useValidatedParams } from "@/hooks/useValidatedParams";

import { useSiteStore } from "./siteStore";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: makeModelIdSchema(siteV3),
  pageId: Schema.optional(Schema.String),
});

export function Wordmark() {
  const session = UserUI.useSession();
  const { username, siteId, pageId } = useValidatedParams(ParamsSchema);
  const draftName = useSiteStore((state) => state.site?.name);
  const settingsOpen = useMatches({
    select: (matches) =>
      matches.some(
        (match) => match.routeId === "/$username/site/$siteId/page/$pageId/_drawer/site-settings",
      ),
  });

  const { data: site } = useLiveQuery({
    session,
    key: siteId,
    query: (db, id) =>
      db.query.site.findFirst({
        where: { id: { eq: id } },
      }),
  });

  const siteName = settingsOpen ? (draftName ?? "") : (site?.name ?? "");

  if (pageId === undefined) {
    return <span className="text-sm font-medium">{siteName}</span>;
  }

  return (
    <Link
      resetScroll={false}
      to="/$username/site/$siteId/page/$pageId"
      params={{ username, siteId, pageId }}
      className="text-sm font-medium"
    >
      {siteName}
    </Link>
  );
}
