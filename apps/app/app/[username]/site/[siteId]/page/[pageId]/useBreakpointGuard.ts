"use client";

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { BREAKPOINTS, PREVIEW_BORDER_WIDTH } from "../../../../../../lib/breakpoints";

/** Choose an initial breakpoint when the URL has no valid selection. */
export function useBreakpointGuard(previewGutter: number) {
  const { breakpoint: requestedBreakpoint } = useSearch({
    from: "/$username/site/$siteId/page/$pageId",
  });
  const navigate = useNavigate();
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);
  const breakpoint = BREAKPOINTS.find((entry) => entry.id === requestedBreakpoint);
  const previewRef = useCallback(
    (element: HTMLElement | null) => {
      if (element === null || breakpoint !== undefined) return;
      const measure = () => setAvailableWidth(Math.max(0, element.clientWidth - 2 * previewGutter));
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => {
        observer.disconnect();
        setAvailableWidth(null);
      };
    },
    [breakpoint, previewGutter],
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

  return { breakpoint, previewRef };
}
