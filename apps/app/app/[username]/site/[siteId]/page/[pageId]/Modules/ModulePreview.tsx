import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { pointerOutsideOfPreview } from "@atlaskit/pragmatic-drag-and-drop/utils/pointer-outside-of-preview";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/utils/set-custom-native-drag-preview";

import { BrickWrapper } from "../../../../../../../modules/components/brick/BrickWrapper";
import { BrickAction } from "../../../../../../../modules/components/BrickAction";
import { BREAKPOINTS } from "../../../../../../../lib/breakpoints";
import { modulesHash } from "../../../../../../../modules/modulesHash";

export function ModulePreview(props: {
  brickModule: (typeof modulesHash)[keyof typeof modulesHash];
  breakpoint: (typeof BREAKPOINTS)[number]["id"];
  cardStyle: boolean;
  verticalAtLg?: boolean;
  sidebarCardWidth?: number;
  moduleAction?: (state: unknown) => ReactNode;
}) {
  const {
    brickModule,
    breakpoint,
    cardStyle,
    verticalAtLg = false,
    sidebarCardWidth,
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
  const previewWidth = Math.max(view.minWidth, Math.min(view.defaultWidth, entry.previewWidth));

  return (
    <div
      className={`brick-catalog-preview flex h-full min-h-0 w-max shrink-0 flex-col overflow-y-auto overscroll-y-contain border-r border-zinc-200 ${verticalAtLg ? "lg:h-auto lg:w-full lg:overflow-visible lg:border-r-0 lg:border-b lg:last:border-b-0" : ""}`}
    >
      <header
        className={`sticky top-0 z-10 flex shrink-0 items-baseline gap-3 border-b border-zinc-200 bg-white px-[var(--brick-catalog-inset)] py-2 text-zinc-950 ${verticalAtLg ? "lg:static" : ""}`}
      >
        <h2 className="m-0 font-normal">{brickModule.label}</h2>
        {maxPerPage !== undefined ? (
          <span className="text-xs text-zinc-500">Limit: {maxPerPage} per page.</span>
        ) : null}
      </header>
      <div
        data-brick-catalog-content=""
        className={`px-[var(--brick-catalog-inset)] pb-16 pt-[var(--brick-catalog-inset)] ${verticalAtLg ? "lg:pb-8" : ""}`}
      >
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
          className={`group/brick relative z-0 shrink-0 cursor-grab ${verticalAtLg && sidebarCardWidth === undefined ? "lg:max-w-full" : ""} ${dragging ? "opacity-40" : ""}`}
          style={{
            width: previewWidth,
            minWidth: view.minWidth,
            zoom:
              sidebarCardWidth === undefined
                ? undefined
                : Math.min(1, sidebarCardWidth / previewWidth),
          }}
        >
          <BrickAction>
            {moduleAction?.(brickModule.hasPlaceholder ? null : previewState)}
          </BrickAction>
          <BrickWrapper className={cardStyle ? "brick-surface-card" : undefined}>
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
