"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefCallback } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { BREAKPOINTS, PREVIEW_BORDER_WIDTH } from "../../../../../../modules/lib/breakpoints";
import { useEditorViewportStore } from "@/stores/useEditorViewportStore";

/** Measure this preview and keep its URL breakpoint within the available width. */
export function useBreakpointGuard(flushPageEditors: (onRecover?: () => void) => boolean) {
  const { breakpoint: requestedBreakpoint } = useSearch({
    from: "/$username/site/$siteId/page/$pageId",
  });
  const navigate = useNavigate();
  const availableWidth = useEditorViewportStore((state) => state.availableWidth);
  const [retainingPreview, setRetainingPreview] = useState(false);
  const hasCurrentMeasurement = useRef(false);
  const breakpoint = BREAKPOINTS.find((entry) => entry.id === requestedBreakpoint);
  const previewWidth = useRef(breakpoint?.previewWidth);
  useLayoutEffect(() => {
    previewWidth.current = breakpoint?.previewWidth;
  }, [breakpoint]);
  const previewRef = useCallback<RefCallback<HTMLElement>>(
    (element) => {
      if (element === null) return;
      let attached = true;
      let waitingForRecovery = false;
      const measure = () => {
        if (!attached) return;
        hasCurrentMeasurement.current = true;
        // Exclude the scrollbar and reserve both frame borders.
        const width = Math.max(0, element.clientWidth - 2 * PREVIEW_BORDER_WIDTH);
        const { availableWidth, setAvailableWidth } = useEditorViewportStore.getState();
        const currentPreviewWidth = previewWidth.current;
        // The Wall unmounts as soon as its breakpoint stops fitting.
        if (
          currentPreviewWidth !== undefined &&
          availableWidth !== null &&
          availableWidth >= currentPreviewWidth &&
          width < currentPreviewWidth
        ) {
          if (!waitingForRecovery) {
            waitingForRecovery = !flushPageEditors(() => {
              waitingForRecovery = false;
              if (!attached) return;
              setRetainingPreview(false);
              setAvailableWidth(Math.max(0, element.clientWidth - 2 * PREVIEW_BORDER_WIDTH));
            });
          }
          if (waitingForRecovery) {
            setRetainingPreview(true);
            return;
          }
        }
        setRetainingPreview(false);
        setAvailableWidth(width);
      };
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => {
        attached = false;
        observer.disconnect();
        hasCurrentMeasurement.current = false;
        useEditorViewportStore.getState().setAvailableWidth(null);
      };
    },
    [flushPageEditors],
  );

  useEffect(() => {
    if (!hasCurrentMeasurement.current) return;
    const measuredWidth = useEditorViewportStore.getState().availableWidth;
    if (measuredWidth === null) return;
    const largestFitting = BREAKPOINTS.filter((entry) => entry.previewWidth <= measuredWidth).at(
      -1,
    );
    if (largestFitting === undefined) return;
    if (breakpoint !== undefined && breakpoint.previewWidth <= measuredWidth) return;
    void navigate({
      to: ".",
      replace: true,
      resetScroll: false,
      search: (previous) => ({
        ...previous,
        breakpoint: largestFitting.id,
      }),
    });
  }, [availableWidth, requestedBreakpoint, breakpoint, navigate]);

  return { breakpoint, previewRef, retainingPreview };
}
