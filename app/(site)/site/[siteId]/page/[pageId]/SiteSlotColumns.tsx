"use client";

import type React from "react";
import { usePageStore } from "./pageStore";

export function SiteSlotColumns(props: { left: React.ReactNode; right: React.ReactNode }) {
  const { left, right } = props;
  const pageType = usePageStore((state) => state.pageType);

  if (pageType === "split-scroll") {
    return (
      <div className="grid h-full grid-cols-2 overflow-hidden">
        <div className="min-h-0 overflow-y-auto">{left}</div>
        <div className="min-h-0 overflow-y-auto">{right}</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="grid min-h-full grid-cols-2">
        <div className="min-h-0">{left}</div>
        <div className="min-h-0">{right}</div>
      </div>
    </div>
  );
}
