"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefCallback } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { BREAKPOINTS, PREVIEW_BORDER_WIDTH } from "../../../../../../modules/lib/breakpoints";

/** Fit the selected Wall to the pane once its inline editors can close. */
export function useBreakpointGuard(
  flushPageEditors: (onRecover?: () => void) => boolean,
  previewGutter: number,
) {
  const { breakpoint: requestedBreakpoint } = useSearch({
    from: "/$username/site/$siteId/page/$pageId",
  });
  const navigate = useNavigate();
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);
  const [retainingPreview, setRetainingPreview] = useState(false);
  const breakpoint = BREAKPOINTS.find((entry) => entry.id === requestedBreakpoint);
  const layout = useRef({ breakpoint, previewGutter });
  const measurePreview = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    layout.current = { breakpoint, previewGutter };
    measurePreview.current?.();
  }, [breakpoint, previewGutter]);
  const previewRef = useCallback<RefCallback<HTMLElement>>(
    (element) => {
      if (element === null) return;
      let waitingForRecovery = false;
      let committedBreakpoint: (typeof BREAKPOINTS)[number] | undefined;
      let committedWidth = 0;
      const measure = () => {
        if (measurePreview.current !== measure) return;
        const { breakpoint, previewGutter } = layout.current;
        // clientWidth excludes the scrollbar. The borders are part of the scaled frame.
        const width = Math.max(0, element.clientWidth - 2 * previewGutter);
        // URL breakpoint changes are flushed by the page navigation blocker.
        if (
          breakpoint !== undefined &&
          breakpoint === committedBreakpoint &&
          committedWidth >= breakpoint.previewWidth + 2 * PREVIEW_BORDER_WIDTH &&
          width < breakpoint.previewWidth + 2 * PREVIEW_BORDER_WIDTH
        ) {
          if (!waitingForRecovery) {
            waitingForRecovery = !flushPageEditors(() => {
              waitingForRecovery = false;
              measure();
            });
          }
          if (waitingForRecovery) {
            setRetainingPreview(true);
            return;
          }
        }
        setRetainingPreview(false);
        committedBreakpoint = breakpoint;
        committedWidth = width;
        setAvailableWidth(width);
      };
      measurePreview.current = measure;
      measure();
      const observer = new ResizeObserver(() => measure());
      observer.observe(element);
      return () => {
        observer.disconnect();
        measurePreview.current = null;
        setAvailableWidth(null);
        setRetainingPreview(false);
      };
    },
    [flushPageEditors],
  );

  useEffect(() => {
    if (breakpoint !== undefined || availableWidth === null || availableWidth === 0) return;
    const largestFitting =
      BREAKPOINTS.findLast(
        (entry) => entry.previewWidth + 2 * PREVIEW_BORDER_WIDTH <= availableWidth,
      ) ?? BREAKPOINTS[0];
    void navigate({
      to: ".",
      replace: true,
      resetScroll: false,
      search: (previous) => ({
        ...previous,
        breakpoint: largestFitting.id,
      }),
    });
  }, [availableWidth, breakpoint, navigate]);

  const scale =
    breakpoint === undefined || availableWidth === null
      ? null
      : Math.min(1, availableWidth / (breakpoint.previewWidth + 2 * PREVIEW_BORDER_WIDTH));

  return { availableWidth, breakpoint, previewRef, retainingPreview, scale };
}
