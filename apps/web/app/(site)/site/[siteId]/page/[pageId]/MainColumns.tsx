"use client";
import { HeroCopy } from "@/components/home/HeroCopy";
import { usePageStore } from "./pageStore";

export function MainColumns() {
  const pageType = usePageStore((state) => state.pageType);

  if (pageType === "split-scroll") {
    return (
      <div className="grid h-full grid-cols-2 overflow-hidden">
        <div className="min-h-0 overflow-y-auto">
          <HeroCopy />
        </div>
        <div data-site-right-scroll className="min-h-0 overflow-y-auto">
          <div className="min-h-full w-full" data-testid="grid-layout" />
        </div>
      </div>
    );
  }

  return (
    <div data-site-right-scroll className="h-full overflow-y-auto">
      <div className="grid min-h-full grid-cols-2">
        <div className="min-h-0">
          <HeroCopy />
        </div>
        <div className="min-h-0">
          <div className="min-h-full w-full" data-testid="grid-layout" />
        </div>
      </div>
    </div>
  );
}
