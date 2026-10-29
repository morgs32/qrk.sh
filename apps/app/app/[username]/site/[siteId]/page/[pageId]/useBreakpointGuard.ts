"use client";

import { useCallback, useEffect, useRef, type RefCallback } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { BREAKPOINTS, PREVIEW_BORDER_WIDTH } from "../../../../../../modules/lib/breakpoints";
import { useEditorViewportStore } from "@/stores/useEditorViewportStore";

/** Measure this preview and keep its URL breakpoint within the available width. */
export function useBreakpointGuard() {
  const params = useParams({ from: "/$username/site/$siteId/page/$pageId" });
  const { stackId } = useParams({ strict: false });
  const { breakpoint: requestedBreakpoint } = useSearch({
    from: "/$username/site/$siteId/page/$pageId",
  });
  const navigate = useNavigate();
  const availableWidth = useEditorViewportStore((state) => state.availableWidth);
  const hasCurrentMeasurement = useRef(false);
  const breakpoint = BREAKPOINTS.find((entry) => entry.id === requestedBreakpoint);
  const previewRef = useCallback<RefCallback<HTMLElement>>((element) => {
    if (element === null) return;
    let attached = true;
    const measure = () => {
      if (!attached) return;
      hasCurrentMeasurement.current = true;
      // Exclude the scrollbar and reserve both frame borders.
      useEditorViewportStore
        .getState()
        .setAvailableWidth(Math.max(0, element.clientWidth - 2 * PREVIEW_BORDER_WIDTH));
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
  }, []);

  useEffect(() => {
    if (!hasCurrentMeasurement.current) return;
    const measuredWidth = useEditorViewportStore.getState().availableWidth;
    if (measuredWidth === null) return;
    const largestFitting = BREAKPOINTS.filter((entry) => entry.previewWidth <= measuredWidth).at(
      -1,
    );
    if (largestFitting === undefined) return;
    if (breakpoint !== undefined && breakpoint.previewWidth <= measuredWidth) return;
    if (stackId !== undefined) {
      void navigate({
        to: "/$username/site/$siteId/page/$pageId",
        params,
        replace: true,
        resetScroll: false,
        search: { breakpoint: largestFitting.id },
      });
      return;
    }
    void navigate({
      to: ".",
      replace: true,
      resetScroll: false,
      search: (previous) => ({
        ...previous,
        breakpoint: largestFitting.id,
        insertion: undefined,
      }),
    });
  }, [availableWidth, requestedBreakpoint, breakpoint, navigate, params, stackId]);

  return { breakpoint, previewRef };
}
