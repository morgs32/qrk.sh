"use client";

import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useContext } from "react";
import { WallModuleAction } from "@qrk.sh/library/WallModuleAction";
import { wallInsertionTargetSchema } from "@qrk.sh/library/wallInsertionTargetSchema";
import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";
import { useLiveQuery } from "@zerospin/react";
import { makeId, stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import { UserUI } from "@/zerospin/UserUI";

import { modulesHash } from "@qrk.sh/library/modulesHash";
import { brickV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV1";
import { makeEffectSchema } from "@zerospin/shapes";
import { Result, Schema } from "effect";
import { makeModelIdSchema } from "@zerospin/core/models/make/makeModelIdSchema";
import { pageV3 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV3";
import { BREAKPOINTS } from "@qrk.sh/library/breakpoints";
import { BrickCardStyleContext } from "@qrk.sh/library/BrickCardStyleContext";

import { CodeText } from "@/app/[username]/site/[siteId]/page/[pageId]/Modules/CodeText";
import { MetadataField } from "@/app/[username]/site/[siteId]/page/[pageId]/Modules/MetadataField";
import { BrickWrapper } from "../../../../../../../../../../../library/components/brick/BrickWrapper";

export default function ModuleRoute() {
  const params = useParams({
    from: "/$username/site/$siteId/page/$pageId/_drawer/modules/$moduleId",
  });
  const { username, siteId, pageId } = params;
  if (!username || !siteId || !pageId) throw new Error("Missing editor route params");
  const { moduleId } = params;

  const decoded = Schema.decodeUnknownResult(
    makeEffectSchema({ moduleId: brickV1.attributes.moduleId }),
  )({ moduleId: moduleId });
  const decodedPageId = Schema.decodeUnknownResult(makeModelIdSchema(Page))(pageId);

  if (Result.isFailure(decoded) || Result.isFailure(decodedPageId)) {
    return (
      <div className="p-6" data-testid="module-not-found">
        <h1>Module not found</h1>
      </div>
    );
  }

  const brickModule = modulesHash[decoded.success.moduleId];
  return <ModuleRouteBody brickModule={brickModule} pageId={decodedPageId.success} />;
}

function ModuleRouteBody(props: {
  brickModule: (typeof modulesHash)[keyof typeof modulesHash];
  pageId: (typeof Page.resourceJsonCodec.Type)["id"];
}) {
  const { brickModule, pageId } = props;
  const cardStyle = useContext(BrickCardStyleContext);
  const params = useParams({
    from: "/$username/site/$siteId/page/$pageId/_drawer/modules/$moduleId",
  });
  const search = useSearch({ from: "/$username/site/$siteId/page/$pageId" });
  const navigate = useNavigate();
  const { activeBreakpoint } = useWallViewport();
  const breakpoint = activeBreakpoint ?? "sm";
  const session = UserUI.useSession();
  const { data: wall } = useLiveQuery({
    session,
    key: { pageId, breakpoint },
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
  const maxPerPage = brickModule.maxPerPage;
  const JsonRender = brickModule.component;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-6">
      <div className="relative px-6 pt-6">
        {activeBreakpoint === null || wall === undefined ? null : (
          <div className="absolute right-6 top-6">
            <WallModuleAction
              wallId={wall.id}
              moduleId={brickModule.id}
              onAdd={
                insertionTarget === null
                  ? undefined
                  : () => {
                      if (insertionTarget === null || insertionTarget.wallId !== wall.id) return;
                      const id = session.runSync(makeId(brickV1));
                      const result = stageAggregateSessionCommand({
                        session,
                        contractName: "addBrick",
                        payload: { id, pageId, moduleId: brickModule.id, target: insertionTarget },
                      });
                      if (result._tag === "Success") {
                        void navigate({
                          to: "/$username/site/$siteId/page/$pageId/brick/$brickId",
                          params: {
                            username: params.username,
                            siteId: params.siteId,
                            pageId,
                            brickId: id,
                          },
                          search: {},
                          resetScroll: false,
                        });
                      }
                    }
              }
            />
          </div>
        )}
        <dl className="mt-5 grid max-w-[500px] grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <MetadataField label="Module name">{brickModule.label}</MetadataField>
          <MetadataField label="Module ID" className="text-right">
            <CodeText>{brickModule.id}</CodeText>
          </MetadataField>
          <MetadataField label="Module description" className="col-span-2">
            {brickModule.description}
          </MetadataField>
        </dl>
        {maxPerPage !== undefined ? (
          <p className="mb-0 mt-3 text-sm text-zinc-500">Limit: {maxPerPage} per page.</p>
        ) : null}
      </div>
      <div className="mt-8 flex flex-col gap-10">
        {BREAKPOINTS.map((entry) => {
          const view = brickModule.viewFor(entry.id);
          const Component = view.component;
          const previewWidth = Math.min(view.defaultWidth, entry.previewWidth);
          return (
            <section key={entry.id}>
              <h2 className="m-0 px-6 text-2xl">{entry.id}</h2>
              <div className="mt-6 overflow-x-auto px-6 pb-4">
                <div className="flex w-max items-start gap-4">
                  <div>
                    <p className="m-0 mb-2 font-mono text-neutral-500">Component</p>
                    <div
                      data-brick-surface=""
                      data-card-style={cardStyle}
                      className="brick-hover-target relative shrink-0"
                      style={{ width: previewWidth, minWidth: view.minWidth }}
                    >
                      <BrickWrapper
                        className="brick-hover-surface"
                        data-brick-full-view={brickModule.def.moduleId}
                        data-testid="component-preview"
                      >
                        <Component state={brickModule.defaultState} />
                      </BrickWrapper>
                    </div>
                  </div>
                  <div>
                    <p className="m-0 mb-2 font-mono text-neutral-500">JsonRender</p>
                    <div
                      data-brick-surface=""
                      data-card-style={cardStyle}
                      className="brick-hover-target relative shrink-0"
                      style={{ width: previewWidth, minWidth: view.minWidth }}
                    >
                      <BrickWrapper
                        className="brick-hover-surface"
                        data-brick-full-view={brickModule.def.moduleId}
                        data-testid="json-render-preview"
                      >
                        <JsonRender
                          breakpoint={entry.id}
                          state={brickModule.defaultState}
                          spec={view.spec}
                        />
                      </BrickWrapper>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
