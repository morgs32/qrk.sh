"use client";

import { makeId, makeIdSchema, stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import { WallModuleAction } from "../../../../../../../modules/lib/wall/WallModuleAction";
import { UserUI } from "@/zerospin/UserUI";
import { useLiveQuery } from "@zerospin/react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";

import { ModuleFilmstrip } from "../../../../../../../modules/lib/ModuleFilmstrip";
import { BREAKPOINTS } from "../../../../../../../modules/lib/breakpoints";
import { brickV2 } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV2";
import { wallInsertionTargetSchema } from "@qrk.sh/zerospin/src/aggregates/user/layout/wallTargetSchemas";
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
  const navigate = useNavigate();
  const session = UserUI.useSession();
  const { data: site } = useLiveQuery({
    session,
    key: params.siteId,
    query: (db, id) => db.query.site.findFirst({ where: { id: { eq: id } } }),
  });
  const { data: walls } = useLiveQuery({
    session,
    key: { pageId: params.pageId, siteId: params.siteId },
    query: (db, key) =>
      db.query.wall.findMany({
        where: { pageId: { eq: key.pageId }, page: { siteId: { eq: key.siteId } } },
      }),
  });
  const wall = walls.find((entry) => entry.breakpoint === breakpoint?.id);
  let insertionTarget: typeof wallInsertionTargetSchema.Type | null = null;
  if (search.insertion !== undefined) {
    try {
      insertionTarget = Schema.decodeUnknownSync(wallInsertionTargetSchema)(
        JSON.parse(search.insertion),
      );
    } catch {
      // Invalid route input remains a refused Add, never an append target.
    }
  }
  if (site === undefined) return <NotFound />;
  if (breakpoint === undefined) return null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 font-mono text-sm leading-5 text-zinc-900">
        <ModuleFilmstrip
          breakpoint={breakpoint.id}
          cardStyle={site.cardStyle}
          renderModuleAction={(brickModule, state) =>
            wall === undefined ? null : (
              <WallModuleAction
                moduleId={brickModule.id}
                onAdd={
                  search.insertion === undefined
                    ? undefined
                    : () => {
                        if (insertionTarget === null || insertionTarget.wallId !== wall.id) return;
                        const id = session.runSync(makeId(brickV2));
                        const result = stageAggregateSessionCommand({
                          session,
                          contractName: "addBrick",
                          payload: {
                            id,
                            pageId: params.pageId,
                            moduleId: brickModule.id,
                            state,
                            target: insertionTarget,
                          },
                        });
                        if (result._tag === "Success") {
                          void navigate({
                            to: "/$username/site/$siteId/page/$pageId/brick/$brickId",
                            params: { ...params, brickId: id },
                            search: (previous) => ({
                              ...previous,
                              breakpoint: breakpoint.id,
                              insertion: undefined,
                            }),
                            resetScroll: false,
                          });
                        }
                      }
                }
              />
            )
          }
          renderModuleLink={(brickModule) => (
            <Link
              to="/$username/site/$siteId/page/$pageId/modules/$moduleId"
              params={{ ...params, moduleId: brickModule.id }}
              search={(previous) => ({
                ...previous,
                breakpoint: breakpoint.id,
                insertion: search.insertion,
              })}
              resetScroll={false}
            >
              {brickModule.label}
            </Link>
          )}
        />
      </div>
    </div>
  );
}
