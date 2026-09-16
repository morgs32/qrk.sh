"use client";

import { useUser } from "@clerk/react";
import { BrickBreakpointProvider } from "@qrk.sh/library/BrickBreakpointProvider";
import { GridStoreProvider } from "@qrk.sh/library/GridStore";
import { Schema } from "effect";

import { Drawers } from "../../Drawers/Drawers";
import { Toolbars } from "../../Toolbars/Toolbars";
import { useBreakpointsPreviewStore } from "../../Toolbars/useBreakpointsPreviewStore";
import { useValidatedParams } from "@/hooks/useValidatedParams";

import { getPageGridStore } from "./getPageGridStore";
import { MainColumns } from "./MainColumns";

const ParamsSchema = Schema.Struct({
  siteId: Schema.String,
  pageId: Schema.String,
});

export default function SitePage() {
  const persistedWidth = useBreakpointsPreviewStore((state) => state.selectedWidth);
  const params = useValidatedParams(ParamsSchema);
  const { user } = useUser();

  if (user === null || user === undefined) {
    return null;
  }

  const pageKey = JSON.stringify([user.id, params.siteId, params.pageId]);
  const gridStore = getPageGridStore(pageKey);

  return (
    <BrickBreakpointProvider persistedWidth={persistedWidth}>
      <GridStoreProvider store={gridStore}>
        <MainColumns />
        <Drawers />
        <Toolbars />
      </GridStoreProvider>
    </BrickBreakpointProvider>
  );
}
