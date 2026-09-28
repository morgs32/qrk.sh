import { useCallback, useState } from "react";

import type { Spec } from "@json-render/core";
import { cn } from "cn";

import { OrderedSection } from "@qrk.sh/web/library/OrderedDoc";

import { MeasuredBrickWrapper } from "../../../../components/brick/MeasuredBrickWrapper";
import { GridItemPreview } from "../../../../lib/GridItemPreview";
import { BREAKPOINTS, minGridUnits } from "../../../../lib/breakpoints";
import { brickDragStore } from "../../../../lib/GridStore";
import { modulesHash } from "../../../../lib/modulesHash";

export function BreakpointPreviewRow({
  entry,
  moduleId,
  brick,
  moduleState,
  BrickComponent,
  className,
  specs,
}: {
  entry: (typeof BREAKPOINTS)[number];
  moduleId: string;
  brick: NonNullable<(typeof modulesHash)[string]>;
  moduleState: unknown;
  BrickComponent: NonNullable<(typeof modulesHash)[string]>["component"];
  className?: string;
  specs: Record<(typeof BREAKPOINTS)[number]["id"], Spec>;
}) {
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
  const dragW = hasDeclaredSize ? declaredW : Math.min(8, measuredW ?? 1);
  const dragH = hasDeclaredSize ? declaredH : (measuredH ?? 1);
  const sizes = BREAKPOINTS.map((breakpointEntry) => {
    const breakpointView = brick.viewFor(breakpointEntry.id);
    const measured = dimensions[breakpointEntry.id];
    return breakpointView.w !== undefined && breakpointView.h !== undefined
      ? { w: breakpointView.w, h: breakpointView.h }
      : measured === undefined
        ? undefined
        : {
            w: Math.min(8, minGridUnits(breakpointEntry.gridItemWidth, measured.widthPx)),
            h: minGridUnits(breakpointEntry.gridItemWidth, measured.heightPx),
          };
  });
  const placementSizes =
    sizes[0] && sizes[1] && sizes[2] && sizes[3]
      ? { sm: sizes[0], md: sizes[1], lg: sizes[2], xl: sizes[3] }
      : null;
  const exceedsWallWidth = hasDeclaredSize
    ? declaredW > 8
    : measuredW !== undefined && measuredW > 8;

  const previewSurface = (
    <div
      className="size-full qrk-bricks brick-drag-surface overflow-hidden"
      data-module-brick={moduleId}
      data-testid="brick-preview"
      draggable={placementSizes !== null}
      onDragStart={(event) => {
        if (placementSizes === null) {
          event.preventDefault();
          return;
        }
        brickDragStore.getState().setBrickDef({
          ...brick.def,
          w: dragW,
          h: dragH,
          placementSizes,
          state: structuredClone(moduleState),
          spec: structuredClone(spec),
        });
        const surface = event.currentTarget;
        if (surface) {
          const bounds = surface.getBoundingClientRect();
          event.dataTransfer.setDragImage(
            surface,
            event.clientX - bounds.left,
            event.clientY - bounds.top,
          );
        }
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/plain", brick.def.moduleId);
      }}
      onDragEnd={() => brickDragStore.getState().setBrickDef(null)}
    >
      <div className="brick-drag-content size-full select-none">
        <BrickComponent breakpoint={entry.id} state={moduleState} spec={spec} />
      </div>
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
            <GridItemPreview breakpoint={entry.id} w={dragW} h={dragH}>
              {previewSurface}
            </GridItemPreview>
            {hasDeclaredSize || (measuredW !== undefined && measuredH !== undefined) ? (
              <p className="m-0 pt-2 font-mono text-neutral-500">
                w={dragW} h={dragH}
              </p>
            ) : null}
          </div>
          <div>
            <p className="m-0 mb-2 font-mono text-neutral-500">intrinsic</p>
            <MeasuredBrickWrapper onChange={(size) => onSizeChange(entry.id, size)}>
              <BrickComponent breakpoint={entry.id} state={moduleState} spec={spec} />
            </MeasuredBrickWrapper>
            <div
              aria-hidden
              className="pointer-events-none absolute overflow-hidden"
              style={{ width: 0, height: 0 }}
            >
              {BREAKPOINTS.map((breakpointEntry) => {
                if (breakpointEntry.id === entry.id) return null;
                const breakpointView = brick.viewFor(breakpointEntry.id);
                if (breakpointView.w !== undefined && breakpointView.h !== undefined) return null;
                return (
                  <MeasuredBrickWrapper
                    key={breakpointEntry.id}
                    onChange={(size) => onSizeChange(breakpointEntry.id, size)}
                  >
                    <BrickComponent
                      breakpoint={breakpointEntry.id}
                      state={moduleState}
                      spec={specs[breakpointEntry.id]}
                    />
                  </MeasuredBrickWrapper>
                );
              })}
            </div>
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
