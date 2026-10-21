"use client";

import { WallModuleAction } from "@qrk.sh/library/WallModuleAction";
import { wallInsertionTargetSchema } from "@qrk.sh/library/wallInsertionTargetSchema";
import { UserUI } from "@/zerospin/UserUI";
import { useLiveQuery } from "@zerospin/react";
import { makeId, stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";

import { ModuleFilmstrip } from "@qrk.sh/library/ModuleFilmstrip";
import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";
import { pageV3 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV3";
import { brickV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV1";
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
  const search = useSearch({ from: "/$username/site/$siteId/page/$pageId" });
  const navigate = useNavigate();
  const session = UserUI.useSession();
  const { data: wall } = useLiveQuery({
    session,
    key: { pageId: params.pageId, breakpoint },
    query: (db, key) =>
      db.query.wall.findFirst({
        where: { pageId: { eq: key.pageId }, breakpoint: { eq: key.breakpoint } },
      }),
  });
  let insertionTarget: typeof wallInsertionTargetSchema.Type | null = null;
  if (search.insertion !== undefined) {
    try {
      const target = Schema.decodeUnknownSync(wallInsertionTargetSchema)(
        JSON.parse(search.insertion),
      );
      if (
        activeBreakpoint !== null &&
        wall !== undefined &&
        wall.breakpoint === activeBreakpoint &&
        target.wallId === wall.id
      )
        insertionTarget = target;
    } catch {
      // Invalid route input never becomes an append target.
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 font-mono text-sm leading-5 text-zinc-900">
        <ModuleFilmstrip
          breakpoint={breakpoint}
          renderModuleAction={(brickModule) =>
            wall === undefined ? null : (
              <WallModuleAction
                wallId={wall.id}
                moduleId={brickModule.id}
                onAdd={
                  insertionTarget === null
                    ? undefined
                    : () => {
                        if (
                          activeBreakpoint === null ||
                          insertionTarget === null ||
                          insertionTarget.wallId !== wall.id
                        )
                          return;
                        const id = session.runSync(makeId(brickV1));
                        const result = stageAggregateSessionCommand({
                          session,
                          contractName: "addBrick",
                          payload: {
                            id,
                            pageId: params.pageId,
                            moduleId: brickModule.id,
                            target: insertionTarget,
                          },
                        });
                        if (result._tag === "Success") {
                          void navigate({
                            to: "/$username/site/$siteId/page/$pageId/brick/$brickId",
                            params: { ...params, brickId: id },
                            search: {},
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
              search={
                insertionTarget === null ? {} : { insertion: JSON.stringify(insertionTarget) }
              }
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
