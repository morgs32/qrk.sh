"use client";

import type { IInferModelRow } from "@zerospin/core/models/types";
import { useLiveQuery } from "@zerospin/react";
import { siteV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { cn } from "cn";
import { UserUI } from "@/zerospin/UserUI";

export function SiteHeader(props: { siteId: IInferModelRow<typeof siteV1>["id"] }) {
  const { siteId } = props;
  const session = UserUI.useSession();
  const { data: site } = useLiveQuery({
    session,
    key: siteId,
    query: (db, id) => db.query.site.findFirstOrThrow({ where: { id: { eq: id } } }),
  });
  return (
    <header
      className={cn(
        "qrk-responsive-insets z-50 flex h-16 shrink-0 items-center justify-between border-b border-border bg-background [padding-inline:var(--qrk-inset-inline)]",
        site.stickyNavbar && "sticky top-0",
      )}
    >
      <span className="text-sm font-medium">{site.name}</span>
    </header>
  );
}
