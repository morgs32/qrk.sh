"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefCallback } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { BREAKPOINTS, PREVIEW_BORDER_WIDTH } from "../../../../../../modules/lib/breakpoints";
import { useEditorViewportStore } from "@/stores/useEditorViewportStore";

/** Measure the preview pane and keep the selected Wall mounted until it is safe to replace. */
export function useBreakpointGuard(
  flushPageEditors: (onRecover?: () => void) => boolean,
  sidebarOpen: boolean,
) {
  const { breakpoint: requestedBreakpoint } = useSearch({
    from: "/$username/site/$siteId/page/$pageId",
  });
  const navigate = useNavigate();
  const [measurement, setMeasurement] = useState<{
    width: number;
    sidebarOpen: boolean;
  } | null>(null);
  const committedMeasurement = useRef(measurement);
  const [retainingPreview, setRetainingPreview] = useState(false);
  const breakpoint = BREAKPOINTS.find((entry) => entry.id === requestedBreakpoint);
  const layout = useRef({ breakpoint, sidebarOpen });
  const measurePreview = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    layout.current = { breakpoint, sidebarOpen };
    measurePreview.current?.();
  }, [breakpoint, sidebarOpen]);
  const previewRef = useCallback<RefCallback<HTMLElement>>(
    (element) => {
      if (element === null) return;
      let waitingForRecovery = false;
      const measure = (recovered = false) => {
        if (measurePreview.current !== measure) return;
        const { breakpoint, sidebarOpen } = layout.current;
        // clientWidth excludes the scrollbar. Reserve both frame borders and sidebar gutters.
        const width = Math.max(
          0,
          element.clientWidth - 2 * PREVIEW_BORDER_WIDTH - (sidebarOpen ? 64 : 0),
        );
        const { availableWidth, setAvailableWidth } = useEditorViewportStore.getState();
        if (availableWidth !== width) setAvailableWidth(width);
        const previous = committedMeasurement.current;
        const previewWidth = breakpoint?.previewWidth;
        // The prior sidebar may have shown a Wall wider than the pane.
        if (
          !recovered &&
          !sidebarOpen &&
          previewWidth !== undefined &&
          width < previewWidth &&
          previous !== null &&
          (previous.sidebarOpen || previous.width >= previewWidth)
        ) {
          if (!waitingForRecovery) {
            waitingForRecovery = !flushPageEditors(() => {
              waitingForRecovery = false;
              measure(true);
            });
          }
          if (waitingForRecovery) {
            setRetainingPreview(true);
            return;
          }
        }
        setRetainingPreview(false);
        if (previous?.width === width && previous.sidebarOpen === sidebarOpen) return;
        const next = { width, sidebarOpen };
        committedMeasurement.current = next;
        setMeasurement(next);
      };
      measurePreview.current = measure;
      measure();
      const observer = new ResizeObserver(() => measure());
      observer.observe(element);
      return () => {
        observer.disconnect();
        measurePreview.current = null;
        committedMeasurement.current = null;
        setMeasurement(null);
        setRetainingPreview(false);
        useEditorViewportStore.getState().setAvailableWidth(null);
      };
    },
    [flushPageEditors],
  );

  const visibleBreakpoint =
    breakpoint !== undefined &&
    measurement !== null &&
    (measurement.sidebarOpen || breakpoint.previewWidth <= measurement.width)
      ? breakpoint
      : undefined;
  useEffect(() => {
    if (
      measurement === null ||
      measurement !== committedMeasurement.current ||
      visibleBreakpoint !== undefined
    )
      return;
    const largestFitting = BREAKPOINTS.findLast((entry) => entry.previewWidth <= measurement.width);
    if (largestFitting === undefined) return;
    void navigate({
      to: ".",
      replace: true,
      resetScroll: false,
      search: (previous) => ({
        ...previous,
        breakpoint: largestFitting.id,
      }),
    });
  }, [measurement, requestedBreakpoint, visibleBreakpoint, navigate]);

  const insufficientWidth =
    visibleBreakpoint === undefined &&
    measurement !== null &&
    measurement.width < BREAKPOINTS[0].previewWidth;

  return { breakpoint, previewRef, retainingPreview, visibleBreakpoint, insufficientWidth };
}
