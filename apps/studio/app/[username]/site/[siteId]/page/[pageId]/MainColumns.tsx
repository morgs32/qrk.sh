"use client";
import { useUser } from "@clerk/react";
import { Schema } from "effect";

import { Article } from "@/components/home/Article";
import { useValidatedParams } from "@/hooks/useValidatedParams";

import { useSiteStore } from "../../siteStore";
import { Grid } from "./Grid";

const ParamsSchema = Schema.Struct({
  siteId: Schema.String,
  pageId: Schema.String,
});

export function MainColumns() {
  const params = useValidatedParams(ParamsSchema);
  const { user } = useUser();
  const pageType = useSiteStore((state) =>
    user === null || user === undefined
      ? undefined
      : state.owners[user.id]?.sites[params.siteId]?.pages[params.pageId]?.pageType,
  );

  if (pageType === undefined) {
    return null;
  }

  if (pageType === "split-scroll") {
    return (
      <div className="grid h-full grid-cols-2 overflow-hidden">
        <div className="min-h-0 overflow-y-auto">
          <Article />
        </div>
        <div data-site-right-scroll className="min-h-0 overflow-y-auto">
          <Grid />
        </div>
      </div>
    );
  }

  return (
    <div data-site-right-scroll className="h-full overflow-y-auto">
      <div className="grid min-h-full grid-cols-2">
        <div className="min-h-0">
          <Article />
        </div>
        <div className="min-h-0">
          <Grid />
        </div>
      </div>
    </div>
  );
}
