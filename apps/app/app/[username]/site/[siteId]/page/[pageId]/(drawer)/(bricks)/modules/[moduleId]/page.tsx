"use client";

import { useParams } from "@tanstack/react-router";
import { useCallback, useState } from "react";

import { modulesHash } from "@qrk.sh/library";
import { libraryModule } from "@qrk.sh/library/libraryModule";
import { makeEffectSchema } from "@zerospin/shapes";
import { Result, Schema } from "effect";
import { makeModelIdSchema } from "@zerospin/core/models/make/makeModelIdSchema";
import { pageV2 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV2";
import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";
import { BREAKPOINTS, minGridUnits } from "@qrk.sh/library/breakpoints";
import { GridItemPreview } from "@qrk.sh/library/GridItemPreview";
import { MeasuredBrickWrapper } from "@qrk.sh/library/MeasuredBrickWrapper";
import { Tabs } from "radix-ui";

import { CodeText } from "@/app/[username]/site/[siteId]/page/[pageId]/Modules/CodeText";
import { MetadataField } from "@/app/[username]/site/[siteId]/page/[pageId]/Modules/MetadataField";

export default function ModuleRoute() {
  const { activeBreakpoint } = useWallViewport();
  const breakpoint = activeBreakpoint ?? "sm";
  const params = useParams({
    from: "/$username/site/$siteId/page/$pageId/_drawer/modules/$moduleId",
  });
  const { username, siteId, pageId } = params;
  if (!username || !siteId || !pageId) throw new Error("Missing editor route params");
  const { moduleId } = params;

  const decoded = Schema.decodeUnknownResult(
    makeEffectSchema({ moduleId: libraryModule.models.brick.attributes.moduleId }),
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
  return <ModuleRouteBody brickModule={brickModule} breakpoint={breakpoint} />;
}

function ModuleRouteBody(props: {
  brickModule: (typeof modulesHash)[keyof typeof modulesHash];
  breakpoint: "sm" | "md" | "lg" | "xl";
}) {
  const { brickModule, breakpoint } = props;
  const maxPerPage = brickModule.maxPerPage;
  const BrickComponent = brickModule.component;
  const view = brickModule.viewFor(breakpoint);
  const [measuredUnits, setMeasuredUnits] = useState<
    Partial<Record<(typeof BREAKPOINTS)[number]["id"], { w: number; h: number }>>
  >({});
  const onSizeChange = useCallback(
    (dimensions: { widthPx: number; heightPx: number }) => {
      const entry = BREAKPOINTS.find((row) => row.id === breakpoint);
      if (entry === undefined) return;
      const nextW = Math.min(8, minGridUnits(entry.gridItemWidth, dimensions.widthPx));
      const nextH = minGridUnits(entry.gridItemWidth, dimensions.heightPx);
      setMeasuredUnits((current) => {
        const measured = current[breakpoint];
        if (measured?.w === nextW && measured.h === nextH) return current;
        return { ...current, [breakpoint]: { w: nextW, h: nextH } };
      });
    },
    [breakpoint],
  );

  const measured = measuredUnits[breakpoint];
  const w = view.w ?? Math.min(8, Math.max(measured?.w ?? 1, view.minW ?? 1));
  const h = view.h ?? Math.max(measured?.h ?? 1, view.minH ?? 1);

  const surface = (
    <div
      className="size-full qrk-bricks overflow-hidden"
      data-brick-full-view={brickModule.def.moduleId}
    >
      <BrickComponent breakpoint={breakpoint} state={brickModule.defaultState} spec={view.spec} />
    </div>
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-6">
      <div className="px-6 pt-6">
        <dl className="mt-5 grid max-w-[500px] grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <MetadataField label="Module name">{brickModule.label}</MetadataField>
          <MetadataField label="Module ID" className="text-right">
            <CodeText>{brickModule.id}</CodeText>
          </MetadataField>
          <MetadataField label="Module description" className="col-span-2">
            {brickModule.description}
          </MetadataField>
        </dl>
      </div>
      <div className="mt-8 flex flex-col gap-10">
        <section key={brickModule.def.moduleId}>
          <Tabs.Root value={`${brickModule.def.moduleId}-preview`}>
            <div className="flex items-baseline justify-between gap-4 px-6">
              <div>
                <h2 className="m-0 text-2xl">{brickModule.label}</h2>
                <p className="mb-0 mt-1 text-sm text-zinc-500">{brickModule.description}</p>
                {maxPerPage !== undefined ? (
                  <p className="mb-0 mt-1 text-sm text-zinc-500">Limit: {maxPerPage} per page.</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-baseline gap-2">
                <Tabs.List
                  className="flex gap-2 text-sm"
                  aria-label={`${brickModule.def.moduleId} preview`}
                >
                  <Tabs.Trigger
                    value={`${brickModule.def.moduleId}-preview`}
                    className="cursor-pointer border-0 bg-transparent p-0 text-sm font-medium text-zinc-950"
                  >
                    {brickModule.label}
                  </Tabs.Trigger>
                </Tabs.List>
              </div>
            </div>
            <Tabs.Content value={`${brickModule.def.moduleId}-preview`}>
              <div className="mt-6 overflow-auto">
                <div className={w === 8 ? "relative" : "relative ml-6"}>
                  <div
                    aria-hidden
                    className="pointer-events-none absolute overflow-hidden"
                    style={{ width: 0, height: 0 }}
                  >
                    {view.w === undefined || view.h === undefined ? (
                      <MeasuredBrickWrapper key={breakpoint} onChange={onSizeChange}>
                        <BrickComponent
                          breakpoint={breakpoint}
                          state={brickModule.defaultState}
                          spec={view.spec}
                        />
                      </MeasuredBrickWrapper>
                    ) : null}
                  </div>
                  <GridItemPreview breakpoint={breakpoint} w={w} h={h}>
                    {surface}
                  </GridItemPreview>
                </div>
              </div>
            </Tabs.Content>
          </Tabs.Root>
        </section>
      </div>
    </div>
  );
}
