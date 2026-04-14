"use client";
import { HeroCopy } from "@/components/home/HeroCopy";
import { Grid } from "./Grid";
import type React from "react";
import { usePageStore } from "./pageStore";

export function MainColumns() {
  const pageType = usePageStore((state) => state.pageType);

  if (pageType === "split-scroll") {
    return (
      <div className="grid h-full grid-cols-2 overflow-hidden">
        <div className="min-h-0 overflow-y-auto">
          <HeroCopy />
        </div>
        <div className="min-h-0 overflow-y-auto">
          <Grid />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="grid min-h-full grid-cols-2">
        <div className="min-h-0">
          <HeroCopy />
        </div>
        <div className="min-h-0">
          <Grid />
        </div>
      </div>
    </div>
  );
}
