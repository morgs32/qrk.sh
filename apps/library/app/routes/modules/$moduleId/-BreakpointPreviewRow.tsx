import { useCallback, useState } from "react";

import type { Spec } from "@json-render/core";
import { cn } from "cn";

import { OrderedSection } from "@qrk.sh/web/library/OrderedDoc";

import { BrickPreview, minGridUnits } from "../../../../lib/BrickPreview";
import { BREAKPOINTS } from "../../../../lib/breakpoints";
import { modulesHash } from "../../../../lib/modulesHash";
import { useBricksStore } from "../../../../lib/BrickStoreProvider";
import { UnconstrainedBrickPreview } from "./-UnconstrainedBrickPreview";

export function BreakpointPreviewRow({
  entry,
  moduleId,
  brick,
  moduleState,
  BrickComponent,
  className,
  spec,
}: {
  entry: (typeof BREAKPOINTS)[number];
  moduleId: string;
  brick: NonNullable<(typeof modulesHash)[string]>;
  moduleState: unknown;
  BrickComponent: NonNullable<(typeof modulesHash)[string]>["component"];
  className?: string;
  spec: Spec;
}) {
  const setActiveBrickDrag = useBricksStore(state => state.setActiveBrickDrag);
  const [intrinsicSize, setIntrinsicSize] = useState<{ widthPx: number; heightPx: number }>();
  const onSizeChange = useCallback((size: { widthPx: number; heightPx: number }) => {
    setIntrinsicSize(current => {
      if (current?.widthPx === size.widthPx && current?.heightPx === size.heightPx) {
        return current;
      }
      return size;
    });
  }, []);

  const [gridUnits, setGridUnits] = useState<{ w: number; h: number }>();
  const onGridUnits = useCallback((size: { w: number; h: number }) => {
    setGridUnits(current => {
      if (current?.w === size.w && current?.h === size.h) return current;
      return size;
    });
  }, []);
  const measuredW = intrinsicSize
    ? minGridUnits(entry.gridItemWidth, intrinsicSize.widthPx)
    : undefined;
  const measuredH = intrinsicSize
    ? minGridUnits(entry.gridItemWidth, intrinsicSize.heightPx)
    : undefined;
  const dragW = gridUnits?.w ?? measuredW ?? 1;
  const dragH = gridUnits?.h ?? measuredH ?? 1;
  const exceedsWallWidth = gridUnits !== undefined && gridUnits.w > 8;

  const previewSurface = (
    <div
      className="size-full qrk-bricks brick-drag-surface overflow-hidden"
      data-module-brick={moduleId}
      data-testid="brick-preview"
      draggable
      onDragStart={event => {
        setActiveBrickDrag({
          ...brick.def,
          w: dragW,
          h: dragH,
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
      onDragEnd={() => setActiveBrickDrag(null)}
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
            <BrickPreview
              breakpoint={entry.id}
              measure={<BrickComponent breakpoint={entry.id} state={moduleState} spec={spec} />}
              onGridUnits={onGridUnits}
            >
              {previewSurface}
            </BrickPreview>
            {gridUnits !== undefined ? (
              <p className="m-0 pt-2 font-mono text-neutral-500">
                w={gridUnits.w} h={gridUnits.h}
              </p>
            ) : null}
          </div>
          <div>
            <p className="m-0 mb-2 font-mono text-neutral-500">intrinsic</p>
            <UnconstrainedBrickPreview onSizeChange={onSizeChange}>
              <BrickComponent breakpoint={entry.id} state={moduleState} spec={spec} />
            </UnconstrainedBrickPreview>
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
