"use client";

import { makeId, makeIdSchema, stageAggregateSessionCommand } from "@zerospin/sdk/browser";

import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useLiveQuery } from "@zerospin/react";
import { UserUI } from "@/zerospin/UserUI";
import { wallInsertionTargetSchema } from "@qrk.sh/zerospin/src/aggregates/user/layout/wallTargetSchemas";
import { WallModuleAction } from "../../../../../../../../../../modules/lib/wall/WallModuleAction";

import { modulesHash } from "../../../../../../../../../../modules/lib/modulesHash";
import { brickV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV1";
import { makeEffectSchema } from "@zerospin/shapes";
import { Result, Schema } from "effect";
import { pageV1 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { siteV1 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { BREAKPOINTS } from "../../../../../../../../../../modules/lib/breakpoints";

import { CodeText } from "@/app/[username]/site/[siteId]/page/[pageId]/Modules/CodeText";
import { MetadataField } from "@/app/[username]/site/[siteId]/page/[pageId]/Modules/MetadataField";
import { BrickWrapper } from "../../../../../../../../../../modules/components/brick/BrickWrapper";
import NotFound from "@/app/not-found";

const PageIdSchema = makeIdSchema(Page);
const SiteIdSchema = makeIdSchema(Site);

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
  const decodedPageId = Schema.decodeUnknownResult(PageIdSchema)(pageId);
  const decodedSiteId = Schema.decodeUnknownResult(SiteIdSchema)(siteId);

  if (Result.isFailure(decoded) || Result.isFailure(decodedPageId)) {
    return (
      <div className="p-6">
        <h1>Module not found</h1>
      </div>
    );
  }

  if (Result.isFailure(decodedSiteId)) return <NotFound />;

  const brickModule = modulesHash[decoded.success.moduleId];
  return (
    <ModuleRouteBody
      brickModule={brickModule}
      pageId={decodedPageId.success}
      siteId={decodedSiteId.success}
    />
  );
}

function ModuleRouteBody(props: {
  brickModule: (typeof modulesHash)[keyof typeof modulesHash];
  pageId: typeof PageIdSchema.Type;
  siteId: typeof SiteIdSchema.Type;
}) {
  const { brickModule, pageId, siteId } = props;
  const params = useParams({ from: "/$username/site/$siteId/page/$pageId" });
  const search = useSearch({ from: "/$username/site/$siteId/page/$pageId" });
  const breakpoint = BREAKPOINTS.find((entry) => entry.id === search.breakpoint);
  const navigate = useNavigate();
  const session = UserUI.useSession();
  const { data: site } = useLiveQuery({
    session,
    key: siteId,
    query: (db, id) => db.query.site.findFirst({ where: { id: { eq: id } } }),
  });
  const { data: walls } = useLiveQuery({
    session,
    key: { pageId, siteId },
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
  const maxPerPage = brickModule.maxPerPage;
  const JsonRender = brickModule.component;
  if (site === undefined) return <NotFound />;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-6">
      <div className="relative px-6 pt-6">
        {wall === undefined || breakpoint === undefined ? null : (
          <div className="absolute right-6 top-6">
            <WallModuleAction
              moduleId={brickModule.id}
              onAdd={
                search.insertion === undefined
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
          const view = brickModule.variants.default;
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
                      className={`brick-surface ${site.cardStyle ? "brick-surface-card" : "brick-surface-flat"} brick-hover-target relative shrink-0`}
                      style={{ width: previewWidth, minWidth: view.minWidth }}
                    >
                      <BrickWrapper className="brick-hover-surface">
                        <Component state={brickModule.defaultState} />
                      </BrickWrapper>
                    </div>
                  </div>
                  <div>
                    <p className="m-0 mb-2 font-mono text-neutral-500">JsonRender</p>
                    <div
                      className={`brick-surface ${site.cardStyle ? "brick-surface-card" : "brick-surface-flat"} brick-hover-target relative shrink-0`}
                      style={{ width: previewWidth, minWidth: view.minWidth }}
                    >
                      <BrickWrapper className="brick-hover-surface">
                        <JsonRender
                          variantId="default"
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
