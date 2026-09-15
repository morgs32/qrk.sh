"use client";

import { useLiveQuery } from "@zerospin/react";
import { Schema } from "effect";
import { Link, href, useMatch } from "react-router";

import { ZerospinUser } from "@/components/ZerospinUser";
import { useValidatedParams } from "@/hooks/useValidatedParams";

import { useSiteStore } from "./siteStore";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.TemplateLiteral(["sit_", Schema.String]),
  pageId: Schema.optional(Schema.String),
});

export function Wordmark() {
  const { username, siteId, pageId } = useValidatedParams(ParamsSchema);
  const draftName = useSiteStore((state) => state.site?.name);
  const settingsOpen =
    useMatch({ path: "/:username/site/:siteId/page/:pageId/site-settings", end: true }) != null;

  const { data: site, error } = useLiveQuery(ZerospinUser, {
    deps: [siteId],
    query: (db) =>
      db.query.site.findFirst({
        where: { id: { eq: siteId } },
      }),
  });

  if (error !== undefined) {
    throw error;
  }

  const siteName = settingsOpen ? (draftName ?? "") : (site?.name ?? "");

  if (pageId === undefined) {
    return <span className="text-sm font-medium">{siteName}</span>;
  }

  return (
    <Link
      to={href("/:username/site/:siteId/page/:pageId", { username, siteId, pageId })}
      className="text-sm font-medium"
    >
      {siteName}
    </Link>
  );
}
