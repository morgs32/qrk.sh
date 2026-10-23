"use client";

import { useSearch } from "@tanstack/react-router";
import { useEditorViewportStore } from "@/stores/useEditorViewportStore";
import { BREAKPOINTS } from "../../../../../../modules/lib/breakpoints";

import { PagePreview } from "./PagePreview";

export function MainColumns() {
  const search = useSearch({ from: "/$username/site/$siteId/page/$pageId" });
  const breakpoint = BREAKPOINTS.find((entry) => entry.id === search.breakpoint);
  const availableWidth = useEditorViewportStore((state) => state.availableWidth);
  const insufficientWidth = availableWidth !== null && availableWidth < BREAKPOINTS[0].previewWidth;

  return (
    <>
      {insufficientWidth ? (
        <p className="p-4 text-sm" role="status">
          At least 360px is needed to preview the page.
        </p>
      ) : null}
      {breakpoint !== undefined &&
      availableWidth !== null &&
      breakpoint.previewWidth <= availableWidth ? (
        <PagePreview key={breakpoint.id} breakpoint={breakpoint} />
      ) : null}
    </>
  );
}
