"use client";

import { useContext } from "react";
import { WallEditorContext } from "../WallEditorContext";
import { WallModuleAction } from "@qrk.sh/library/WallModuleAction";
import { UserApp } from "@/zerospin/userSession";
import { useLiveQuery } from "@zerospin/react";
import { Link } from "@tanstack/react-router";

import { ModuleFilmstrip } from "@qrk.sh/library/ModuleFilmstrip";
import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";
import { pageV3 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV3";
import { makeModelIdSchema } from "@zerospin/core/models/make/makeModelIdSchema";
import { Schema } from "effect";

import { useValidatedParams } from "@/hooks/useValidatedParams";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: makeModelIdSchema(Page),
});

export function Modules() {
  const { activeBreakpoint, displayPlaceholders } = useWallViewport();
  const breakpoint = activeBreakpoint ?? "sm";
  const params = useValidatedParams(ParamsSchema);
  const editor = useContext(WallEditorContext);
  if (editor === null) throw new Error("Modules requires WallEditorContext");
  const session = UserApp.useInitializedSession();
  const { data: wall } = useLiveQuery({
    session,
    key: { pageId: params.pageId, breakpoint },
    query: (db, key) =>
      db.query.wall.findFirst({
        where: { pageId: { eq: key.pageId }, breakpoint: { eq: key.breakpoint } },
      }),
  });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 font-mono text-sm leading-5 text-zinc-900">
        <ModuleFilmstrip
          breakpoint={breakpoint}
          displayPlaceholders={displayPlaceholders}
          renderModuleAction={(brickModule) =>
            wall === undefined ? null : (
              <WallModuleAction
                wallId={wall.id}
                moduleId={brickModule.id}
                onAdd={
                  editor.insertionTarget === null
                    ? undefined
                    : () => editor.addBrick(brickModule.id)
                }
              />
            )
          }
          renderModuleLink={(brickModule) => (
            <Link
              to="/$username/site/$siteId/page/$pageId/modules/$moduleId"
              params={{ ...params, moduleId: brickModule.id }}
              search={
                editor.insertionTarget === null
                  ? {}
                  : { insertion: JSON.stringify(editor.insertionTarget) }
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
