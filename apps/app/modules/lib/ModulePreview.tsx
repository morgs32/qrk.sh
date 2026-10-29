import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
  verticalAtLg?: boolean;
  moduleLink: ReactNode;
  moduleAction?: (state: unknown) => ReactNode;
}) {
  const {
    brickModule,
    breakpoint,
    cardStyle,
    verticalAtLg = false,
    moduleLink,
    moduleAction,
  } = props;
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewState, setPreviewState] = useState<unknown>(() => brickModule.def.state);
  const committedState = useRef(previewState);
  const dragInProgress = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const updatePreviewState = useCallback((state: unknown) => {
    if (!dragInProgress.current) setPreviewState(state);
  }, []);
  useLayoutEffect(() => {
    committedState.current = previewState;
  }, [previewState]);
  useEffect(() => {
    const element = previewRef.current;
    if (element === null) throw new Error("Missing drawer Brick preview");
    const observer = new IntersectionObserver((entries) => {
      setIsVisible(entries.some((entry) => entry.isIntersecting));
    });
    observer.observe(element);
    const onVisibilityChange = () => setDocumentVisible(document.visibilityState === "visible");
    onVisibilityChange();
    document.addEventListener("visibilitychange", onVisibilityChange);
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotionPreferenceChange = () => setReducedMotion(motionPreference.matches);
    onMotionPreferenceChange();
    motionPreference.addEventListener("change", onMotionPreferenceChange);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      motionPreference.removeEventListener("change", onMotionPreferenceChange);
    };
  }, []);
  useEffect(() => {
    const element = previewRef.current;
    if (element === null) throw new Error("Missing drawer Brick preview");
    return draggable({
      element,
      getInitialData: () => {
        dragInProgress.current = true;
        setDragging(true);
        return {
          type: "drawer-brick",
          moduleId: brickModule.id,
          state: brickModule.hasPlaceholder ? null : structuredClone(committedState.current),
        };
      },
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
      onDrop: () => {
        dragInProgress.current = false;
        setDragging(false);
      },
    });
  }, [brickModule.id, brickModule.hasPlaceholder]);
  const maxPerPage = brickModule.maxPerPage;
  const view = brickModule.variants.default;
  const Component = view.component;
  const Preview = view.preview;
  const entry = BREAKPOINTS.find((row) => row.id === breakpoint);
  if (entry === undefined) throw new Error(`Unknown breakpoint: ${breakpoint}`);

  return (
    <div
      className={`flex h-full min-h-0 w-max shrink-0 flex-col overflow-y-auto overscroll-y-contain border-r border-zinc-200 ${verticalAtLg ? "lg:h-auto lg:w-full lg:overflow-visible lg:border-r-0 lg:border-b lg:last:border-b-0" : ""}`}
    >
      <h2
        className={`sticky top-0 z-10 m-0 shrink-0 px-8 py-4 font-normal ${verticalAtLg ? "lg:static" : ""}`}
      >
        {moduleLink}
      </h2>
      <div className={`px-8 pb-16 pt-2 ${verticalAtLg ? "lg:pb-8" : ""}`}>
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
          className={`brick-surface ${cardStyle ? "brick-surface-card" : ""} brick-hover-target group/brick relative shrink-0 cursor-grab ${verticalAtLg ? "lg:max-w-full" : ""} ${dragging ? "opacity-40" : ""}`}
          style={{
            width: Math.min(view.defaultWidth, entry.previewWidth),
            minWidth: view.minWidth,
          }}
        >
          <BrickAction>
            {moduleAction?.(brickModule.hasPlaceholder ? null : previewState)}
          </BrickAction>
          <BrickWrapper className="brick-hover-surface h-auto">
            {Preview === undefined ? (
              <Component state={previewState} />
            ) : (
              <Preview
                state={previewState}
                setState={updatePreviewState}
                isActive={isVisible && documentVisible && !dragging && !reducedMotion}
              />
            )}
          </BrickWrapper>
        </div>
      </div>
    </div>
  );
}
