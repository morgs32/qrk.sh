"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { modulesHash } from "@qrk.sh/library";
import { libraryModule } from "@qrk.sh/library/libraryModule";
import { userSession } from "@/zerospin/userSession";
import { pageV1 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { makeModelIdSchema } from "@zerospin/core/models/make/makeModelIdSchema";
import { makeEffectSchema } from "@zerospin/schema";
import { useLiveQuery } from "@zerospin/react";
import { Result, Schema } from "effect";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BrickDrawerLayout(props: { children: ReactNode }) {
  const { children } = props;
  const {
    username,
    siteId,
    pageId,
    moduleId: routeModuleId,
    brickId,
  } = useParams<{
    username: string;
    siteId: string;
    pageId: string;
    moduleId?: string;
    brickId?: string;
  }>();
  const session = userSession;
  const decodedBrickId = Schema.decodeUnknownResult(makeModelIdSchema(libraryModule.models.brick))(
    brickId,
  );
  const decodedPageId = Schema.decodeUnknownResult(makeModelIdSchema(Page))(pageId);
  const { data: page } = useLiveQuery({
    session,
    key: Result.isSuccess(decodedPageId) ? decodedPageId.success : null,
    query: (db, id) => db.query.page.findFirst({ where: { id: { eq: id ?? "pag_missing" } } }),
  });
  const brickQuery = useLiveQuery({
    session,
    key: { brickId: Result.isSuccess(decodedBrickId) ? decodedBrickId.success : null, wallId: page?.wallId },
    query: (db, { brickId: id, wallId }) => db.query.brick.findFirst({
      where: { id: { eq: id ?? "brk_missing" }, wallId: { eq: wallId ?? "wal_missing" } },
    }),
  });
  const decodedModule = Schema.decodeUnknownResult(
    makeEffectSchema({ moduleId: libraryModule.models.brick.attributes.moduleId }),
  )({ moduleId: brickId === undefined ? routeModuleId : brickQuery.data?.moduleId });
  const moduleId = Result.isSuccess(decodedModule) ? decodedModule.success.moduleId : undefined;
  const moduleLabel = moduleId === undefined ? undefined : modulesHash[moduleId].label;
  const base = `/${encodeURIComponent(username)}/site/${encodeURIComponent(siteId)}/page/${encodeURIComponent(pageId)}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border/60 px-4 py-2.5">
        <nav aria-label="Drawer breadcrumbs" className="flex min-w-0 items-center gap-2">
          <Link href={`${base}/modules`} scroll={false}>
            Bricks
          </Link>
          {moduleId !== undefined && moduleLabel !== undefined ? (
            <>
              <span aria-hidden className="text-muted-foreground">
                /
              </span>
              {brickId === undefined ? (
                <span className="truncate">{moduleLabel}</span>
              ) : (
                <>
                  <Link
                    href={`${base}/modules/${encodeURIComponent(moduleId)}`}
                    scroll={false}
                    className="truncate"
                  >
                    {moduleLabel}
                  </Link>
                  <span aria-hidden className="text-muted-foreground">
                    /
                  </span>
                  <span className="truncate">{`~${brickId.slice(-5)}`}</span>
                </>
              )}
            </>
          ) : null}
        </nav>
        <Button asChild variant="ghost" size="icon">
          <Link href={base} scroll={false} aria-label="Close drawer">
            <X aria-hidden />
          </Link>
        </Button>
      </header>
      {children}
    </div>
  );
}
