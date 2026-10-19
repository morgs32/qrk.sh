"use client";

import { Link, useMatches } from "@tanstack/react-router";

import { useLiveQuery } from "@zerospin/react";
import { Schema } from "effect";

import { UserApp } from "@/zerospin/userSession";
import { useValidatedParams } from "@/hooks/useValidatedParams";

import { useSiteStore } from "./siteStore";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.TemplateLiteral(["sit_", Schema.String]),
  pageId: Schema.optional(Schema.String),
});

export function Wordmark() {
  const session = UserApp.useInitializedSession();
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
    key: [siteId],
    query: (db) =>
      db.query.site.findFirst({
        where: { id: { eq: siteId } },
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
