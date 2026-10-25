import { useEffect, useRef, useState, type ReactNode } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { pointerOutsideOfPreview } from "@atlaskit/pragmatic-drag-and-drop/utils/pointer-outside-of-preview";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/utils/set-custom-native-drag-preview";

import { BrickWrapper } from "../components/brick/BrickWrapper";
import { BrickAction } from "../components/BrickAction";
import { BREAKPOINTS } from "./breakpoints";
import { modulesHash } from "./modulesHash";

export function ModulePreview(props: {
  brickModule: (typeof modulesHash)[keyof typeof modulesHash];
  breakpoint: (typeof BREAKPOINTS)[number]["id"];
  cardStyle: boolean;
  moduleLink: ReactNode;
  moduleAction?: ReactNode;
}) {
  const { brickModule, breakpoint, cardStyle, moduleLink, moduleAction } = props;
  const previewRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const element = previewRef.current;
    if (element === null) throw new Error("Missing drawer Brick preview");
    return draggable({
      element,
      getInitialData: () => ({ type: "drawer-brick", moduleId: brickModule.id }),
      onGenerateDragPreview: ({ nativeSetDragImage }) => {
        setCustomNativeDragPreview({
          nativeSetDragImage,
          getOffset: pointerOutsideOfPreview({ x: "16px", y: "8px" }),
          render: ({ container }) => {
            const appearance = getComputedStyle(element);
            container.classList.add("qrk-bricks", "brick-drag-preview");
            container.classList.toggle("dark", element.closest(".dark") !== null);
            container.style.font = appearance.font;
            container.style.color = appearance.color;
            container.append(element.cloneNode(true));
          },
        });
      },
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false),
    });
  }, [brickModule.id]);
  const maxPerPage = brickModule.maxPerPage;
  const view = brickModule.variants.default;
  const Component = view.component;
  const entry = BREAKPOINTS.find((row) => row.id === breakpoint);
  if (entry === undefined) throw new Error(`Unknown breakpoint: ${breakpoint}`);

  return (
    <div className="flex h-full min-h-0 w-max shrink-0 flex-col overflow-y-auto overscroll-y-contain border-r border-zinc-200 bg-zinc-100">
      <h2 className="sticky top-0 z-10 m-0 shrink-0 bg-inherit px-8 py-4 font-normal">
        {moduleLink}
      </h2>
      <div className="px-8 pb-16 pt-2">
        {maxPerPage !== undefined ? (
          <p className="mb-3 mt-0 max-w-64 text-sm text-zinc-500">Limit: {maxPerPage} per page.</p>
        ) : null}
        <div
          ref={previewRef}
          data-drawer-module-id={brickModule.id}
          onMouseDownCapture={(event) => {
            // Let the template drag take priority over interactive preview gestures.
            event.stopPropagation();
          }}
          onPointerDownCapture={(event) => {
            // Keep native image/link drags on the registered template surface.
            event.currentTarget
              .querySelectorAll<HTMLAnchorElement | HTMLImageElement>("a, img")
              .forEach((child) => {
                child.draggable = false;
              });
          }}
          className={`brick-surface ${cardStyle ? "brick-surface-card" : "brick-surface-flat"} brick-hover-target group/brick relative shrink-0 cursor-grab ${dragging ? "opacity-40" : ""}`}
          style={{
            width: Math.min(view.defaultWidth, entry.previewWidth),
            minWidth: view.minWidth,
          }}
        >
          <BrickAction>{moduleAction}</BrickAction>
          <BrickWrapper className="brick-hover-surface">
            <Component state={brickModule.def.state} />
          </BrickWrapper>
        </div>
      </div>
    </div>
  );
}
