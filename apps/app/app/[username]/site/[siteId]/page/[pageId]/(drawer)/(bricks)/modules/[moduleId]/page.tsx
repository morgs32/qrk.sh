"use client";

import { makeIdSchema } from "@zerospin/sdk/browser";

import { useParams } from "@tanstack/react-router";
import { useContext } from "react";
import { WallEditorContext } from "../../../../WallEditorContext";
import { WallModuleAction } from "../../../../../../../../../../modules/lib/wall/WallModuleAction";

import { modulesHash } from "../../../../../../../../../../modules/lib/modulesHash";
import { brickV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV1";
import { makeEffectSchema } from "@zerospin/shapes";
import { Result, Schema } from "effect";
import { pageV3 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV3";
import { BREAKPOINTS } from "../../../../../../../../../../modules/lib/breakpoints";
import { BrickCardStyleContext } from "../../../../../../../../../../modules/lib/BrickCardStyleContext";

import { CodeText } from "@/app/[username]/site/[siteId]/page/[pageId]/Modules/CodeText";
import { MetadataField } from "@/app/[username]/site/[siteId]/page/[pageId]/Modules/MetadataField";
import { BrickWrapper } from "../../../../../../../../../../modules/components/brick/BrickWrapper";

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
  const decodedPageId = Schema.decodeUnknownResult(makeIdSchema(Page))(pageId);

  if (Result.isFailure(decoded) || Result.isFailure(decodedPageId)) {
    return (
      <div className="p-6" data-testid="module-not-found">
        <h1>Module not found</h1>
      </div>
    );
  }

  const brickModule = modulesHash[decoded.success.moduleId];
  return <ModuleRouteBody brickModule={brickModule} />;
}

function ModuleRouteBody(props: { brickModule: (typeof modulesHash)[keyof typeof modulesHash] }) {
  const { brickModule } = props;
  const cardStyle = useContext(BrickCardStyleContext);
  const editor = useContext(WallEditorContext);
  if (editor === null) throw new Error("ModuleRoute requires WallEditorContext");
  const maxPerPage = brickModule.maxPerPage;
  const JsonRender = brickModule.component;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-6">
      <div className="relative px-6 pt-6">
        {editor.activeWallId === null ? null : (
          <div className="absolute right-6 top-6">
            <WallModuleAction
              wallId={editor.activeWallId}
              moduleId={brickModule.id}
              onAdd={
                editor.insertionTarget === null ? undefined : () => editor.addBrick(brickModule.id)
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
