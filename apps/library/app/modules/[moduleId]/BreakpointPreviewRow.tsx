import { useCallback, useState } from "react";

import type { Spec } from "@json-render/core";
import { cn } from "cn";

import { OrderedSection } from "@qrk.sh/web/library/OrderedDoc";

import { MeasuredBrickWrapper } from "../../../components/brick/MeasuredBrickWrapper";
import { GridItemPreview } from "../../../lib/GridItemPreview";
import { BREAKPOINTS, minGridUnits } from "../../../lib/breakpoints";
import { modulesHash } from "../../../lib/modulesHash";

export function BreakpointPreviewRow(props: {
  entry: (typeof BREAKPOINTS)[number];
  moduleId: keyof typeof modulesHash;
  brick: (typeof modulesHash)[keyof typeof modulesHash];
  moduleState: unknown;
  BrickComponent: (typeof modulesHash)[keyof typeof modulesHash]["component"];
  className?: string;
  specs: Record<(typeof BREAKPOINTS)[number]["id"], Spec>;
}) {
  const { entry, moduleId, brick, moduleState, BrickComponent, className, specs } = props;
  const maxPerPage = brick.maxPerPage;
  const [measurement, setMeasurement] = useState<{
    state: unknown;
    specs: typeof specs;
    dimensions: Partial<
      Record<(typeof BREAKPOINTS)[number]["id"], { widthPx: number; heightPx: number }>
    >;
  }>();
  const dimensions =
    measurement !== undefined && measurement.state === moduleState && measurement.specs === specs
      ? measurement.dimensions
      : {};
  const onSizeChange = useCallback(
    (
      targetBreakpoint: (typeof BREAKPOINTS)[number]["id"],
      size: { widthPx: number; heightPx: number },
    ) => {
      setMeasurement((current) => {
        const currentDimensions =
          current !== undefined && current.state === moduleState && current.specs === specs
            ? current.dimensions
            : {};
        const previous = currentDimensions[targetBreakpoint];
        if (previous?.widthPx === size.widthPx && previous.heightPx === size.heightPx)
          return current;
        return {
          state: moduleState,
          specs,
          dimensions: { ...currentDimensions, [targetBreakpoint]: size },
        };
      });
    },
    [moduleState, specs],
  );

  const view = brick.viewFor(entry.id);
  const spec = specs[entry.id];
  const declaredW = view.w;
  const declaredH = view.h;
  const hasDeclaredSize = declaredW !== undefined && declaredH !== undefined;
  const intrinsicSize = dimensions[entry.id];
  const measuredW = intrinsicSize
    ? minGridUnits(entry.gridItemWidth, intrinsicSize.widthPx)
    : undefined;
  const measuredH = intrinsicSize
    ? minGridUnits(entry.gridItemWidth, intrinsicSize.heightPx)
    : undefined;
  const previewW = hasDeclaredSize
    ? declaredW
    : Math.min(8, Math.max(measuredW ?? 1, view.minW ?? 1));
  const previewH = hasDeclaredSize ? declaredH : Math.max(measuredH ?? 1, view.minH ?? 1);
  const exceedsWallWidth = hasDeclaredSize
    ? declaredW > 8
    : measuredW !== undefined && measuredW > 8;

  const previewSurface = (
    <div
      className="size-full qrk-bricks overflow-hidden"
      data-module-brick={moduleId}
      data-testid="brick-preview"
    >
      <BrickComponent breakpoint={entry.id} state={moduleState} spec={spec} />
    </div>
  );

  return (
    <OrderedSection
      className={cn(className, exceedsWallWidth && "rounded-md border border-red-200 bg-red-50")}
      label={entry.id}
    >
      <div className="overflow-x-auto px-4 py-8">
        <div className="flex w-max items-start gap-4">
          <div>
            <p className="m-0 mb-2 font-mono text-neutral-500">gridItem</p>
            {maxPerPage !== undefined ? (
              <p className="mb-3 mt-0 max-w-64 text-sm text-neutral-500">
                Limit: {maxPerPage} per page.
              </p>
            ) : null}
            <GridItemPreview breakpoint={entry.id} w={previewW} h={previewH}>
              {previewSurface}
            </GridItemPreview>
            {hasDeclaredSize || (measuredW !== undefined && measuredH !== undefined) ? (
              <p className="m-0 pt-2 font-mono text-neutral-500">
                w={previewW} h={previewH}
              </p>
            ) : null}
          </div>
          <div>
            <p className="m-0 mb-2 font-mono text-neutral-500">intrinsic</p>
            <MeasuredBrickWrapper onChange={(size) => onSizeChange(entry.id, size)}>
              <BrickComponent breakpoint={entry.id} state={moduleState} spec={spec} />
            </MeasuredBrickWrapper>
            {intrinsicSize !== undefined ? (
              <p className="m-0 pt-2 font-mono text-neutral-500">
                {intrinsicSize.widthPx}×{intrinsicSize.heightPx}px
              </p>
            ) : null}
            {measuredW !== undefined && measuredH !== undefined ? (
              <p className="m-0 pt-2 font-mono text-neutral-500">
                w={measuredW} h={measuredH}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </OrderedSection>
  );
}
